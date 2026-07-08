// Vercel Serverless Function — 아파트 실거래가 (국토부 RTMS, data.go.kr)
// 매매/전월세/분양권전매. DATA_API_KEY 재사용. WAF 회피 위해 User-Agent 필요.
import { XMLParser } from "fast-xml-parser";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";
const ENDPOINT = {
  trade: "1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade",   // 매매
  rent:  "1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent",     // 전월세
  silv:  "1613000/RTMSDataSvcSilvTrade/getRTMSDataSvcSilvTrade", // 분양권전매
};
const xml = new XMLParser({ ignoreAttributes: true, parseTagValue: false });
const S = (v) => String(v ?? "").trim();
const won = (v) => Number(String(v ?? "").replace(/[^0-9]/g, "")) || 0;

async function call(type, lawd, ym, pageNo) {
  const url = `https://apis.data.go.kr/${ENDPOINT[type]}?serviceKey=${encodeURIComponent(process.env.DATA_API_KEY)}&LAWD_CD=${lawd}&DEAL_YMD=${ym}&numOfRows=100&pageNo=${pageNo}&_type=json`;
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(14000) });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = xml.parse(t); }
  const body = j?.response?.body;
  const rc = j?.response?.header?.resultCode;
  if (rc && rc !== "000" && rc !== "00") throw new Error(j?.response?.header?.resultMsg || `API ${rc}`);
  let items = body?.items?.item ?? [];
  if (!Array.isArray(items)) items = items ? [items] : [];
  return items;
}

function normalize(type, it) {
  const y = S(it.dealYear), m = S(it.dealMonth).padStart(2, "0"), d = S(it.dealDay).padStart(2, "0");
  const base = {
    apt: S(it.aptNm) || S(it.aptDong),
    dong: S(it.umdNm),
    area: Number(it.excluUseAr) || null,
    floor: S(it.floor),
    buildYear: S(it.buildYear),
    date: `${y}-${m}-${d}`,
  };
  if (type === "rent") {
    return { ...base, kind: won(it.monthlyRent) > 0 ? "월세" : "전세", deposit: won(it.deposit), monthly: won(it.monthlyRent) };
  }
  // trade / silv 는 dealAmount(만원)
  return { ...base, amount: won(it.dealAmount) };
}

export default async function handler(req, res) {
  try {
    if (!process.env.DATA_API_KEY) return res.status(200).json({ ok: false, needKey: true, message: "DATA_API_KEY가 설정되지 않았습니다." });
    const type = ["trade", "rent", "silv"].includes(String(req.query.type)) ? String(req.query.type) : "trade";
    const lawd = String(req.query.lawd || "").trim();
    const ym = String(req.query.ym || "").trim();
    if (!/^\d{5}$/.test(lawd) || !/^\d{6}$/.test(ym)) return res.status(400).json({ error: "지역코드(lawd 5자리)와 연월(ym YYYYMM)이 필요합니다." });

    let items = await call(type, lawd, ym, 1);
    const rows = items.map((it) => normalize(type, it))
      .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
    return res.status(200).json({ ok: true, type, count: rows.length, rows: rows.slice(0, 100) });
  } catch (err) {
    const msg = err?.name === "TimeoutError" ? "실거래가 API 응답 시간 초과" : String(err?.message || err);
    return res.status(500).json({ error: msg });
  }
}
