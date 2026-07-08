// Vercel Serverless Function — 주소→좌표 지오코딩 (vworld)
// 도로명 → 실패 시 지번 순으로 시도. VWORLD_API_KEY 사용.

async function vworld(addr, type) {
  const qs = new URLSearchParams({
    service: "address", request: "getcoord", version: "2.0", crs: "epsg:4326",
    address: addr, type, format: "json", key: process.env.VWORLD_API_KEY,
  });
  const r = await fetch(`https://api.vworld.kr/req/address?${qs}`, { signal: AbortSignal.timeout(10000) });
  const j = await r.json().catch(() => ({}));
  const res = j?.response;
  if (res?.status === "OK" && res?.result?.point) {
    return { lat: Number(res.result.point.y), lon: Number(res.result.point.x), refined: res?.refined?.text || addr };
  }
  return null;
}

export default async function handler(req, res) {
  try {
    if (!process.env.VWORLD_API_KEY) return res.status(200).json({ ok: false, needKey: true, message: "VWORLD_API_KEY가 설정되지 않았습니다." });
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "주소(q)가 필요합니다." });
    const hit = (await vworld(q, "road")) || (await vworld(q, "parcel"));
    if (!hit) return res.status(200).json({ ok: false, message: `'${q}' 주소를 찾을 수 없습니다. 도로명/지번 주소로 입력해보세요.` });
    return res.status(200).json({ ok: true, ...hit });
  } catch (err) {
    const msg = err?.name === "TimeoutError" ? "지오코딩 응답 시간 초과" : String(err?.message || err);
    return res.status(500).json({ error: msg });
  }
}
