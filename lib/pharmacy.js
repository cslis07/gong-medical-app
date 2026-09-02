// Vercel Serverless Function — 문 연 약국 (내 주변, 실시간)
// 국립중앙의료원 E-Gen getParmacyLcinfoInqire: 좌표를 주면 «거리순 정렬 + 오늘 영업시간 +
// 좌표»를 바로 준다. 야간진료(clinic)와 달리 원본이 위치 필터를 해주므로 스냅샷이 필요 없다
// — 항상 최신, 유지보수 0. '지금 열림'은 프론트가 현재시각으로 계산(Edge 캐시 stale 무관).
import { errorMessage } from "./respond.js";

const BASE = "http://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyLcinfoInqire";
const num = (v) => { const n = Number(String(v ?? "").trim()); return Number.isFinite(n) ? n : null; };

export default async function handler(req, res) {
  try {
    const KEY = process.env.DATA_API_KEY;
    if (!KEY) return res.status(200).json({ ok: false, needKey: true, message: "DATA_API_KEY(공공데이터 인증키)가 설정되지 않았습니다." });

    const lat = Number(req.query.lat), lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: "현재 위치(lat, lon)가 필요합니다." });
    const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 50);

    const url = `${BASE}?serviceKey=${encodeURIComponent(KEY)}&WGS84_LON=${lon}&WGS84_LAT=${lat}&pageNo=1&numOfRows=${limit}&_type=json`;
    const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(13000) });
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { return res.status(502).json({ error: "약국 정보 응답을 해석하지 못했습니다." }); }
    let items = j?.response?.body?.items?.item || [];
    if (!Array.isArray(items)) items = items ? [items] : [];

    const rows = items.map((p) => ({
      name: p.dutyName,
      addr: p.dutyAddr,
      tel: p.dutyTel1,
      lat: num(p.latitude),
      lon: num(p.longitude),
      distance: Math.round((Number(p.distance) || 0) * 1000),  // 원본 km → m
      // 오늘 영업시간(HHMM). 없으면 null → 프론트가 '시간 정보 없음'으로 표기.
      start: num(p.startTime),
      end: num(p.endTime),
    })).filter((p) => p.lat != null && p.lon != null);

    return res.status(200).json({ ok: true, rows });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "약국") });
  }
}
