// Vercel Serverless Function — 야간(저녁) 진료 병의원 (E-Gen 스냅샷 기반)
// 원본 API에 위치 필터가 없어 빌드타임 스냅샷(data/night-clinics.js)을 굽고,
// 여기서 좌표 반경으로 잘라 거리순으로 준다. '지금 진료중'은 프론트가 현재시각으로 계산
// (서버가 계산하면 Edge 캐시에 고정되어 stale해지므로).
import { CLINICS, generatedAt } from "../data/night-clinics.js";
import { errorMessage } from "./respond.js";

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default async function handler(req, res) {
  try {
    const lat = Number(req.query.lat), lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: "현재 위치(lat, lon)가 필요합니다." });
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 60);
    const radius = Math.min(Math.max(Number(req.query.radius) || 5000, 500), 20000);

    // 컬럼형 행: [n, a, t, g, la, lo, s, e]
    const toObj = (c, d) => ({ name: c[0], addr: c[1], tel: c[2], dgsbjt: c[3], lat: c[4], lon: c[5], distance: d, start: c[6], end: c[7] });
    const scored = CLINICS.map((c) => ({ c, d: Math.round(haversine(lat, lon, c[4], c[5])) })).sort((a, b) => a.d - b.d);
    let near = scored.filter((x) => x.d <= radius).slice(0, limit);
    let widened = false;
    if (!near.length) { near = scored.slice(0, limit); widened = true; }   // 반경 내 없으면 최근접(시골 대비)
    const rows = near.map(({ c, d }) => toObj(c, d));
    return res.status(200).json({ ok: true, generatedAt, widened, rows });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "야간진료") });
  }
}
