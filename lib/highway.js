// Vercel Serverless Function — 고속도로(한국도로공사 EX) 휴게소 + 실시간 소통
// data.ex.co.kr OpenAPI. 봇 차단이 있어 User-Agent + Referer 필수. 키는 EX_API_KEY.
//   휴게소: restinfo/restConvList(편의시설) + restinfo/restBestfoodList(음식) + business/curStateStation(유가)
//   소통  : odtraffic/trafficAmountByCongest(현재 정체/서행 구간만 반환)

const EX = "https://data.ex.co.kr/openapi";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";
const CONGEST_GRADE = { "2": "서행", "3": "정체" };
const OILCO = { SKE: "SK에너지", GSC: "GS칼텍스", HDO: "현대오일뱅크", SOL: "S-OIL", RTE: "알뜰", RTX: "고속도로알뜰", NHO: "농협알뜰", AD: "고속도로알뜰(EX)", ETC: "자가상표" };

async function exGet(path, params) {
  const qs = new URLSearchParams({ key: process.env.EX_API_KEY, type: "json", ...params });
  const r = await fetch(`${EX}/${path}?${qs}`, {
    headers: { "User-Agent": UA, Referer: "https://data.ex.co.kr/", Accept: "application/json" },
    signal: AbortSignal.timeout(13000),
  });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { list: [], _blocked: /Request Blocked/i.test(t) }; }
}
// "죽전(서울)휴게소" / "죽전(서울)주유소" → "죽전(서울)"
const baseName = (s) => String(s || "").replace(/(휴게소|주유소|LPG충전소|충전소|SA)\s*$/g, "").trim();
const numOrNull = (v) => (/^\d+(\.\d+)?$/.test(String(v)) ? Number(v) : null);

async function restArea(q) {
  const [conv, food, oil] = await Promise.all([
    exGet("restinfo/restConvList", { stdRestNm: q, numOfRows: "100" }),
    exGet("restinfo/restBestfoodList", { stdRestNm: q, numOfRows: "100" }),
    exGet("business/curStateStation", { serviceAreaName: q, numOfRows: "50" }),
  ]);
  if (conv._blocked || food._blocked || oil._blocked) return { blocked: true, rows: [] };

  const map = new Map(); // baseName → 휴게소 객체
  const get = (nm, routeNm, addr) => {
    const k = baseName(nm);
    if (!map.has(k)) map.set(k, { name: k, route: routeNm || "", addr: addr || "", facilities: [], foods: [], oil: null });
    const o = map.get(k);
    if (routeNm && !o.route) o.route = routeNm;
    if (addr && !o.addr) o.addr = addr;
    return o;
  };
  for (const r of conv.list || []) {
    const o = get(r.stdRestNm, r.routeNm, r.svarAddr);
    if (r.psName && !o.facilities.includes(r.psName)) o.facilities.push(r.psName);
  }
  for (const r of food.list || []) {
    const o = get(r.stdRestNm, r.routeNm, r.svarAddr);
    o.foods.push({ name: r.foodNm, cost: numOrNull(r.foodCost), best: r.bestfoodyn === "Y", recommend: r.recommendyn === "Y" });
  }
  for (const r of oil.list || []) {
    const o = get(r.serviceAreaName, r.routeName, r.svarAddr);
    o.oil = {
      company: OILCO[r.oilCompany] || r.oilCompany || "",
      gasoline: numOrNull(r.gasolinePrice), diesel: numOrNull(r.diselPrice), lpg: numOrNull(r.lpgPrice),
      tel: r.telNo || "",
    };
  }
  // 음식은 추천/베스트 우선 정렬
  const rows = [...map.values()].map((o) => ({
    ...o,
    foods: o.foods.sort((a, b) => (b.recommend + b.best) - (a.recommend + a.best)).slice(0, 8),
  }));
  return { rows: rows.slice(0, 10) };
}

async function congest() {
  const d = await exGet("odtraffic/trafficAmountByCongest", { numOfRows: "500" });
  if (d._blocked) return { blocked: true, rows: [] };
  const rows = (d.list || []).map((r) => ({
    route: r.routeName, zone: r.conzoneName,
    grade: CONGEST_GRADE[String(r.grade)] || r.grade,
    gradeCode: Number(r.grade) || 0,
    speed: Number(r.speed) || null,
    updown: r.updownTypeCode === "S" ? "기점방향" : r.updownTypeCode === "E" ? "종점방향" : "",
  })).sort((a, b) => b.gradeCode - a.gradeCode || (a.speed || 99) - (b.speed || 99));
  return { rows };
}

export default async function handler(req, res) {
  try {
    if (!process.env.EX_API_KEY) return res.status(200).json({ ok: false, needKey: true, message: "EX_API_KEY(고속도로 공공데이터 인증키)가 설정되지 않았습니다." });
    const op = String(req.query.op || "rest");
    if (op === "congest") {
      const out = await congest();
      if (out.blocked) return res.status(200).json({ ok: false, message: "고속도로 포털 접근이 일시 차단되었습니다." });
      return res.status(200).json({ ok: true, ...out });
    }
    // op=rest
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "휴게소명(q)이 필요합니다. 예: 죽전, 안성" });
    const out = await restArea(q);
    if (out.blocked) return res.status(200).json({ ok: false, message: "고속도로 포털 접근이 일시 차단되었습니다." });
    return res.status(200).json({ ok: true, ...out });
  } catch (err) {
    const msg = err?.name === "TimeoutError" ? "고속도로 API 응답 시간 초과" : String(err?.message || err);
    return res.status(500).json({ error: msg });
  }
}
