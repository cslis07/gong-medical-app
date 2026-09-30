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
  gas: () => import("../lib/gas.js"),
  bike: () => import("../lib/bike.js"),
  highway: () => import("../lib/highway.js"),
  geocode: () => import("../lib/geocode.js"),   // 위치 탭들의 주소→좌표 변환에 쓰임(단독 유지)
  parking: () => import("../lib/parking.js"),
  clinic: () => import("../lib/clinic.js"),
  pharmacy: () => import("../lib/pharmacy.js"),
  emergency: () => import("../lib/emergency.js"),
};

// Vercel Edge 캐시(s-maxage)는 **사용자 간에 공유**된다.
// 이 앱은 인증이 없고 응답이 요청자에 따라 달라지지 않으므로 안전하고,
// 상위 공공 API 일일 트래픽 한도(보통 1,000회)를 지키는 유일한 실질적 방어선이다.
// 위치 기반 조회는 좌표가 같으면 같은 답이라 CDN 캐시가 잘 듣는다.
//
// [초, s-maxage] · stale-while-revalidate는 만료 후에도 낡은 응답을 주며 뒤에서 갱신
const CACHE = {
  geocode: () => [86400, 86400],
  gas: (q) => (q.op === "recent" ? [3600, 7200] : q.op === "avg" ? [3600, 7200] : [300, 600]),
  // 휴게소·영업소목록은 불변에 가깝고, 소통·돌발·구간소요시간은 실시간이라 짧게
  highway: (q) => (q.op === "rest" || q.op === "tollgates" ? [3600, 7200] : [60, 180]),
  // 위치 기반이지만 좌표가 같으면 같은 답. 실시간 잔여면(live=1)은 더 짧게.
  parking: (q) => (q.diag === "1" ? [0, 0] : q.live === "1" ? [30, 120] : [60, 300]),
  subway: (q) => (q.kind === "mapData" ? [86400, 86400] : [30, 60]),
  bike: () => [60, 120],
  // 실시간 인구 — 원본이 5분 주기
  density: () => [120, 300],
  // 야간진료: 좌표 같으면 같은 답(스냅샷). '지금 진료중'은 프론트가 계산해 stale 무관
  clinic: () => [300, 900],
  // 약국: 오늘 영업시간은 하루 동안 불변, '지금 열림'은 프론트 계산 → 넉넉히 캐시
  pharmacy: () => [300, 900],
  // 응급실: 실시간 병상이 응답에 실려 있어 오래 캐시하면 stale — 짧게
  emergency: () => [30, 120],
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
