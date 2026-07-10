// Vercel Serverless Function — 통합 API 라우터 (catch-all)
// Hobby 플랜 함수 12개 제한 대응: /api/{service} 를 단일 함수로 받아 lib/ 핸들러에 위임.
// 기존 프론트 URL(/api/subway, /api/gas 등)은 그대로 동작한다.
//
// 핸들러는 **지연 로드**한다. 정적 import로 두면 lib/parking.js가 끌어오는
// data/parking-nationwide.js(4.5MB, 17,768개 객체 리터럴)가 로또·지하철 같은
// 무관한 요청의 콜드스타트에서도 매번 파싱된다.

const HANDLERS = {
  subway: () => import("../lib/subway.js"),
  density: () => import("../lib/density.js"),
  lotto: () => import("../lib/lotto.js"),
  gas: () => import("../lib/gas.js"),
  bike: () => import("../lib/bike.js"),
  highway: () => import("../lib/highway.js"),
  realestate: () => import("../lib/realestate.js"),
  air: () => import("../lib/air.js"),
  citybus: () => import("../lib/citybus.js"),
  lh: () => import("../lib/lh.js"),
  geocode: () => import("../lib/geocode.js"),
  myhome: () => import("../lib/myhome.js"),
  parking: () => import("../lib/parking.js"),
};

// Vercel Edge 캐시(s-maxage)는 **사용자 간에 공유**된다.
// 이 앱은 인증이 없고 응답이 요청자에 따라 달라지지 않으므로 안전하고,
// 상위 공공 API 일일 트래픽 한도(보통 1,000회)를 지키는 유일한 실질적 방어선이다.
// 예: /api/realestate 요청 1건 = RTMS 최대 30회 호출 → 캐시가 없으면 33요청에 하루치 소진.
//
// [초, s-maxage] · stale-while-revalidate는 만료 후에도 낡은 응답을 주며 뒤에서 갱신
const CACHE = {
  // 확정·불변에 가까운 것
  lotto: (q) => (q.round && q.round !== "latest" ? [604800, 604800] : [600, 1800]),
  // 원본 갱신이 느린 것
  realestate: () => [1800, 3600],
  lh: () => [1800, 3600],
  geocode: () => [86400, 86400],
  gas: (q) => (q.op === "avg" ? [3600, 7200] : [300, 600]),
  highway: (q) => (q.op === "congest" ? [120, 300] : [3600, 7200]),
  air: () => [600, 1200],
  myhome: () => [1800, 3600],
  // 위치 기반이지만 좌표가 같으면 같은 답 (주차장은 서울 실시간이 섞여 짧게)
  parking: (q) => (q.diag === "1" ? [0, 0] : [60, 300]),
  subway: (q) => (q.kind === "mapData" ? [86400, 86400] : [30, 60]),
  bike: () => [60, 120],
  citybus: (q) => (q.op === "near" ? [600, 1200] : [20, 60]),
  // 실시간 인구 — 원본이 5분 주기
  density: () => [120, 300],
};

export default async function handler(req, res) {
  const svc = String(req.query.service || "");
  const setCache = (v) => { if (typeof res.setHeader === "function") res.setHeader("Cache-Control", v); };

  const load = Object.prototype.hasOwnProperty.call(HANDLERS, svc) ? HANDLERS[svc] : null;
  if (!load) { setCache("no-store"); return res.status(404).json({ error: "알 수 없는 서비스입니다." }); }

  // service 파라미터는 하위 핸들러 쿼리에서 제거
  delete req.query.service;

  const [sMaxAge, swr] = CACHE[svc]?.(req.query) || [0, 0];
  const cacheable = `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`;
  setCache(sMaxAge > 0 ? cacheable : "no-store");

  // 오류 응답이 Edge에 캐시되면 일시 장애가 s-maxage 동안 고착된다.
  // 핸들러가 200이 아닌 상태로 응답하면 캐시를 끈다.
  // (핸들러들은 상위 API 실패도 200 + {ok:false}로 내려보내는 경우가 있어 아래에서 한 번 더 본다)
  // 모든 핸들러가 `res.status(code).json(body)` 형태로만 응답하므로 이 래핑으로 충분하다.
  const origStatus = res.status.bind(res);
  res.status = (code) => {
    if (code !== 200) setCache("no-store");
    const chain = origStatus(code);
    return { json: (body) => { if (body && body.ok === false) setCache("no-store"); return chain.json(body); } };
  };

  const mod = await load();
  return mod.default(req, res);
}
