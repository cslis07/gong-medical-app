// Vercel Serverless Function — 공공임대주택 단지정보 (마이홈포털, LH+SH+지방공사 통합)
// data.myhome.go.kr/rentalHouseList. DATA_API_KEY 재사용(단, 마이홈 엔드포인트는 승인 후 별도 전파 필요).

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";
const SUPPLY = { "10": "영구임대", "20": "국민임대", "30": "행복주택", "40": "장기전세", "50": "매입임대", "60": "전세임대" };

export default async function handler(req, res) {
  try {
    if (!process.env.DATA_API_KEY) return res.status(200).json({ ok: false, needKey: true, message: "DATA_API_KEY가 설정되지 않았습니다." });
    const brtc = String(req.query.brtc || "").trim();
    if (!/^\d{2}$/.test(brtc)) return res.status(400).json({ error: "시도코드(brtc, 2자리)가 필요합니다." });
    const qs = new URLSearchParams({
      serviceKey: process.env.DATA_API_KEY, brtcCode: brtc,
      pageNo: String(Number(req.query.page) || 1), numOfRows: String(Math.min(Number(req.query.size) || 40, 100)),
    });
    const signgu = String(req.query.signgu || "").trim();
    if (signgu) qs.set("signguCode", signgu);

    const r = await fetch(`https://data.myhome.go.kr:443/rentalHouseList?${qs}`, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(14000) });
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { return res.status(200).json({ ok: false, message: `마이홈 응답 파싱 실패: ${t.slice(0, 100)}` }); }

    if (j.code === "30") return res.status(200).json({ ok: false, pending: true, message: "공공임대 단지 API 승인이 전파 중입니다(오늘 승인). 잠시 후 다시 시도해 주세요." });

    let items = j?.hsmpList || j?.response?.body?.items?.item || j?.data || [];
    if (!Array.isArray(items)) items = items ? [items] : [];
    const rows = items.map((it) => ({
      name: it.hsmpNm || it.bldNm || "",
      addr: it.fullAdr || it.bassAdr || it.rnAdr || "",
      supply: it.suplyTyNm || SUPPLY[String(it.suplyTyCd)] || "",
      households: Number(it.hshldCo || it.totHshldCo || 0) || null,
      built: it.cmptYm || it.useAprvDay || "",
      area: it.styleNm || it.suplyAr || "",
    })).filter((x) => x.name);
    return res.status(200).json({ ok: true, count: rows.length, rows });
  } catch (err) {
    const msg = err?.name === "TimeoutError" ? "마이홈 API 응답 시간 초과" : String(err?.message || err);
    return res.status(500).json({ error: msg });
  }
}
