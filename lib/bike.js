// Vercel Serverless Function — 따릉이(서울 공공자전거) 실시간 대여소
// 서울 열린데이터 bikeList(실시간 대여정보) 사용. 기존 SEOUL_API_KEY 재사용.
// 위치 없이 전체를 받아(최대 ~3천개) 브라우저 위치 기준 haversine로 가까운 순 정렬.

import { errorMessage } from "./respond.js";

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

export default async function handler(req, res) {
  try {
    const KEY = process.env.SEOUL_API_KEY;
    if (!KEY) return res.status(500).json({ error: "SEOUL_API_KEY 환경변수가 설정되지 않았습니다." });
    const lat = Number(req.query.lat), lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: "현재 위치(lat, lon)가 필요합니다." });
    const limit = Math.min(Math.max(Number(req.query.limit) || 7, 1), 20);

    // bikeList는 호출당 최대 1000건 → 3페이지 병렬(서울 대여소 ~2700개)
    const pages = await Promise.all([[1, 1000], [1001, 2000], [2001, 3000]].map(([s, e]) =>
      getJson(`${BASE}/${KEY}/json/bikeList/${s}/${e}/`)));
    let rows = [];
    for (const p of pages) {
      const list = p?.rentBikeStatus?.row;
      if (Array.isArray(list)) rows.push(...list);
    }
    if (!rows.length) return res.status(200).json({ ok: true, rows: [], message: "대여소 정보를 불러오지 못했습니다." });

    const near = rows.map((s) => {
      const slat = Number(s.stationLatitude), slon = Number(s.stationLongitude);
      return {
        id: s.stationId,
        name: String(s.stationName || "").replace(/^\d+\.\s*/, ""),
        bikes: Number(s.parkingBikeTotCnt || 0),   // 대여 가능 자전거
        racks: Number(s.rackTotCnt || 0),           // 거치대 수
        lat: slat, lon: slon,
        distance: Number.isFinite(slat) && Number.isFinite(slon) ? Math.round(haversine(lat, lon, slat, slon)) : Infinity,
      };
    }).filter((s) => Number.isFinite(s.distance))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);

    return res.status(200).json({ ok: true, total: rows.length, rows: near });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "따릉이") });
  }
}
