// Vercel Serverless Function — 응급실 실시간 가용병상 (내 주변)
// E-Gen 두 API를 hpid로 조인한다:
//   ① getEgytLcinfoInqire(좌표)      → 근처 응급의료기관 거리순(hpid·좌표·거리)
//   ② getEmrrmRltmUsefulSckbdInfoInqire(시도) → 실시간 가용병상·장비 (hpid 키)
// 근처 결과의 시도(보통 1~2개)만 실시간 조회해 붙인다. 스냅샷 불가한 «살아있는 수용력».
// ⚠️ hvec(응급실 일반병상 가용)은 음수가 될 수 있다 = 정원 초과(포화). 프론트가 그렇게 표기.
import { errorMessage } from "./respond.js";

const B = "http://apis.data.go.kr/B552657/ErmctInfoInqireService";
const num = (v) => { const n = Number(String(v ?? "").trim()); return Number.isFinite(n) ? n : null; };
const isY = (v) => String(v ?? "").toUpperCase() === "Y";

async function egen(path, params, KEY) {
  const qs = new URLSearchParams({ serviceKey: KEY, _type: "json", ...params });
  const r = await fetch(`${B}/${path}?${qs}`, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(13000) });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { throw new Error("응급실 정보 응답 해석 실패"); }
  let it = j?.response?.body?.items?.item;
  if (it && !Array.isArray(it)) it = [it];
  return it || [];
}

export default async function handler(req, res) {
  try {
    const KEY = process.env.DATA_API_KEY;
    if (!KEY) return res.status(200).json({ ok: false, needKey: true, message: "DATA_API_KEY(공공데이터 인증키)가 설정되지 않았습니다." });

    const lat = Number(req.query.lat), lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: "현재 위치(lat, lon)가 필요합니다." });
    const limit = Math.min(Math.max(Number(req.query.limit) || 15, 1), 30);

    // ① 근처 응급의료기관 (거리순)
    const near = await egen("getEgytLcinfoInqire", { WGS84_LON: String(lon), WGS84_LAT: String(lat), pageNo: "1", numOfRows: String(limit) }, KEY);
    const list = near.map((e) => ({
      hpid: e.hpid,
      name: e.dutyName,
      addr: e.dutyAddr,
      tel: e.dutyTel1 || e.dutyTel3 || "",
      lat: num(e.wgs84Lat) ?? num(e.latitude),
      lon: num(e.wgs84Lon) ?? num(e.longitude),
      distance: Math.round((Number(e.distance) || 0) * 1000),
      sido: String(e.dutyAddr || "").trim().split(/\s+/)[0] || "",
    }));

    // ② 근처가 걸친 시도만 실시간 조회 (보통 1~2개) → hpid 맵
    const sidos = [...new Set(list.map((e) => e.sido).filter(Boolean))].slice(0, 3);
    const rtMap = new Map();
    await Promise.all(sidos.map(async (s) => {
      try {
        const rows = await egen("getEmrrmRltmUsefulSckbdInfoInqire", { STAGE1: s, pageNo: "1", numOfRows: "200" }, KEY);
        rows.forEach((r) => rtMap.set(r.hpid, r));
      } catch { /* 한 시도 실패해도 나머지는 붙인다 */ }
    }));

    const rows = list.map((e) => {
      const r = rtMap.get(e.hpid);
      return {
        ...e,
        beds: r ? num(r.hvec) : null,       // 응급실 일반병상 가용(음수=포화)
        updatedAt: r ? String(r.hvidate || "") : null,
        ct: r ? isY(r.hvctayn) : null,
        mri: r ? isY(r.hvmriayn) : null,
        venti: r ? isY(r.hvventiayn) : null, // 인공호흡기
      };
    });

    return res.status(200).json({ ok: true, rows });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "응급실") });
  }
}
