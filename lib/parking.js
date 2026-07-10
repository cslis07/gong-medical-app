// Vercel Serverless Function — 근처 공영주차장 (서울 열린데이터광장, 기존 SEOUL_API_KEY 재사용)
//   GetParkInfo     : 서울 공영주차장 전체(2,200여곳) — 좌표·요금·운영시간·총구획수
//   GetParkingInfo  : 실시간 주차대수 제공 주차장(120여곳) — NOW_PRK_VHCL_CNT
// 두 결과를 PKLT_CD로 병합해 '잔여 면수'를 계산하고, 위치 기준 haversine 정렬.
// 참고: 전국 단위(한국교통안전공단 B553881/Parking)는 data.go.kr 심의 승인 후 확장 가능.

const BASE = "http://openapi.seoul.go.kr:8088";

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(13000) });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return {}; }
}
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const N = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const hhmm = (v) => { const s = String(v ?? "").padStart(4, "0"); return /^\d{4}$/.test(s) ? `${s.slice(0, 2)}:${s.slice(2)}` : ""; };

export default async function handler(req, res) {
  try {
    const KEY = process.env.SEOUL_API_KEY;
    if (!KEY) return res.status(200).json({ ok: false, needKey: true, message: "SEOUL_API_KEY가 설정되지 않았습니다." });
    const lat = Number(req.query.lat), lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: "현재 위치(lat, lon)가 필요합니다." });
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 30);

    // 전체 주차장(3페이지 병렬) + 실시간 목록
    const [p1, p2, p3, rt] = await Promise.all([
      getJson(`${BASE}/${KEY}/json/GetParkInfo/1/1000/`),
      getJson(`${BASE}/${KEY}/json/GetParkInfo/1001/2000/`),
      getJson(`${BASE}/${KEY}/json/GetParkInfo/2001/3000/`),
      getJson(`${BASE}/${KEY}/json/GetParkingInfo/1/300/`),
    ]);
    let all = [];
    for (const p of [p1, p2, p3]) { const l = p?.GetParkInfo?.row; if (Array.isArray(l)) all.push(...l); }
    if (!all.length) return res.status(200).json({ ok: true, rows: [], message: "주차장 정보를 불러오지 못했습니다." });

    // 실시간 주차대수 인덱스 — 갱신시각이 있는 행만 신뢰
    const rtRows = rt?.GetParkingInfo?.row || [];
    const rtMap = new Map();
    for (const r of rtRows) {
      if (String(r.NOW_PRK_VHCL_UPDT_TM || "").trim()) rtMap.set(String(r.PKLT_CD), r);
    }

    // 노상주차장은 구획(1면)마다 행이 하나씩이라 PKLT_CD로 묶어 총 면수를 합산한다.
    // (실측: 다중행 그룹 65개는 전부 TPKCT=1, 큰 값 중복 그룹은 0개)
    const groups = new Map();
    for (const p of all) {
      const plat = N(p.LAT), plon = N(p.LOT);
      if (!plat || !plon || plat < 33 || plon < 124) continue;  // 좌표 없는 항목 제외
      const cd = String(p.PKLT_CD);
      const dist = Math.round(haversine(lat, lon, plat, plon));
      const g = groups.get(cd);
      if (!g) groups.set(cd, { p, cap: N(p.TPKCT) || 0, lat: plat, lon: plon, distance: dist });
      else {
        g.cap += N(p.TPKCT) || 0;
        if (dist < g.distance) { g.distance = dist; g.lat = plat; g.lon = plon; }  // 가장 가까운 구획 좌표
      }
    }

    const rows = [...groups.entries()].map(([cd, g]) => {
      const p = g.p, cap = g.cap || null;
      const live = rtMap.get(cd);
      const now = live ? N(live.NOW_PRK_VHCL_CNT) : null;
      return {
        name: p.PKLT_NM, addr: p.ADDR, tel: p.TELNO || "",
        kind: p.PKLT_KND_NM || "", oper: p.OPER_SE_NM || "",
        free: String(p.CHGD_FREE_NM || "").includes("무료"),
        capacity: cap,
        // 갱신시각이 있는 실시간 주차장만 잔여면수 계산 (음수 방지)
        nowCnt: now, available: live && cap != null && now != null ? Math.max(0, cap - now) : null,
        updatedAt: live ? live.NOW_PRK_VHCL_UPDT_TM : "",
        rate: N(p.PRK_CRG), rateMin: N(p.PRK_HM),
        addRate: N(p.ADD_CRG), addMin: N(p.ADD_UNIT_TM_MNT),
        dailyMax: N(p.DLY_MAX_CRG),
        wd: [hhmm(p.WD_OPER_BGNG_TM), hhmm(p.WD_OPER_END_TM)].filter(Boolean).join("~"),
        we: [hhmm(p.WE_OPER_BGNG_TM), hhmm(p.WE_OPER_END_TM)].filter(Boolean).join("~"),
        lat: g.lat, lon: g.lon, distance: g.distance,
      };
    });

    let out = rows.sort((a, b) => a.distance - b.distance);
    if (String(req.query.live) === "1") out = out.filter((r) => r.available != null);
    if (String(req.query.free) === "1") out = out.filter((r) => r.free);

    return res.status(200).json({ ok: true, total: rows.length, liveCount: rtMap.size, rows: out.slice(0, limit) });
  } catch (err) {
    const msg = err?.name === "TimeoutError" ? "주차장 API 응답 시간 초과" : String(err?.message || err);
    return res.status(500).json({ error: msg });
  }
}
