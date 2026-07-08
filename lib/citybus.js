// Vercel Serverless Function — 시내버스 실시간 (국토부 TAGO, data.go.kr)
//   op=near   : 좌표기반 근접정류소 (BusSttnInfoInqireService/getCrdntPrxmtSttnList)
//   op=arrival: 정류소별 버스도착정보 (ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList)
// DATA_API_KEY 재사용. WAF 회피 위해 User-Agent 필요.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";
const BASE = "https://apis.data.go.kr/1613000";
const ROUTE_TP = { "1": "공항", "2": "마을", "3": "간선", "4": "지선", "5": "순환", "6": "광역", "10": "일반", "11": "직행", "13": "고속", "14": "농어촌" };

async function getJson(path, params) {
  const qs = new URLSearchParams({ serviceKey: process.env.DATA_API_KEY, _type: "json", ...params });
  const r = await fetch(`${BASE}/${path}?${qs}`, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(13000) });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { return { rows: [], _raw: t.slice(0, 120) }; }
  let items = j?.response?.body?.items?.item ?? [];
  if (!Array.isArray(items)) items = items ? [items] : [];
  return { rows: items, code: j?.response?.header?.resultCode, msg: j?.response?.header?.resultMsg };
}
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default async function handler(req, res) {
  try {
    if (!process.env.DATA_API_KEY) return res.status(200).json({ ok: false, needKey: true, message: "DATA_API_KEY가 설정되지 않았습니다." });
    const op = String(req.query.op || "near");

    if (op === "arrival") {
      const city = String(req.query.city || "").trim(), node = String(req.query.node || "").trim();
      if (!city || !node) return res.status(400).json({ error: "cityCode(city)와 nodeId(node)가 필요합니다." });
      const { rows } = await getJson("ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList", { cityCode: city, nodeId: node, numOfRows: "30", pageNo: "1" });
      const buses = rows.map((b) => ({
        route: String(b.routeno),
        type: ROUTE_TP[String(b.routetp)] || String(b.routetp || "").replace(/버스$/, ""),
        min: Math.max(0, Math.round(Number(b.arrtime || 0) / 60)),
        prevCnt: Number(b.arrprevstationcnt || 0),
      })).sort((a, b) => a.min - b.min);
      return res.status(200).json({ ok: true, buses });
    }

    // op=near
    const lat = Number(req.query.lat), lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: "현재 위치(lat, lon)가 필요합니다." });
    const { rows } = await getJson("BusSttnInfoInqireService/getCrdntPrxmtSttnList", { gpsLati: lat, gpsLong: lon, numOfRows: "30", pageNo: "1" });
    const stops = rows.map((s) => {
      const slat = Number(s.gpslati), slon = Number(s.gpslong);
      return {
        node: String(s.nodeid), name: String(s.nodenm), city: String(s.citycode),
        arsno: s.nodeno ? String(s.nodeno) : "",
        lat: slat, lon: slon,
        distance: Number.isFinite(slat) ? Math.round(haversine(lat, lon, slat, slon)) : null,
      };
    }).sort((a, b) => (a.distance ?? 9e9) - (b.distance ?? 9e9)).slice(0, 10);
    return res.status(200).json({ ok: true, stops });
  } catch (err) {
    const msg = err?.name === "TimeoutError" ? "버스 API 응답 시간 초과" : String(err?.message || err);
    return res.status(500).json({ error: msg });
  }
}
