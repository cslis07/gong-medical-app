// Vercel Serverless Function — 아파트 실거래가 (국토부 RTMS, data.go.kr)
// 매매/전월세/분양권전매. DATA_API_KEY 재사용. WAF 회피 위해 User-Agent 필요.
import { XMLParser } from "fast-xml-parser";
import { pool } from "./pool.js";
import { errorMessage } from "./respond.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";
const ENDPOINT = {
  trade: "1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade",   // 매매
  rent:  "1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent",     // 전월세
  silv:  "1613000/RTMSDataSvcSilvTrade/getRTMSDataSvcSilvTrade", // 분양권전매
};
const xml = new XMLParser({ ignoreAttributes: true, parseTagValue: false });
const S = (v) => String(v ?? "").trim();
const won = (v) => Number(String(v ?? "").replace(/[^0-9]/g, "")) || 0;

const PER_PAGE = 100;   // RTMS numOfRows 상한
const MAX_PAGES = 30;   // 안전장치 (= 3,000건). 시군구·월 단위라 실제로는 수백~천여 건 수준.
// RTMS는 호출 1건이 5~9초로 느린 대신 병렬에 강하다(17페이지 동시 요청도 누락 없음).
// LH(동시성 4)와 달리 높게 잡아야 Vercel 함수 시간 안에 끝난다.
const CONCURRENCY = 20;

async function call(type, lawd, ym, pageNo) {
  const url = `https://apis.data.go.kr/${ENDPOINT[type]}?serviceKey=${encodeURIComponent(process.env.DATA_API_KEY)}&LAWD_CD=${lawd}&DEAL_YMD=${ym}&numOfRows=${PER_PAGE}&pageNo=${pageNo}&_type=json`;
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(14000) });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = xml.parse(t); }
  const body = j?.response?.body;
  const rc = j?.response?.header?.resultCode;
  if (rc && rc !== "000" && rc !== "00") throw new Error(j?.response?.header?.resultMsg || `API ${rc}`);
  let items = body?.items?.item ?? [];
  if (!Array.isArray(items)) items = items ? [items] : [];
  return { items, total: Number(body?.totalCount) || 0 };
}

/** 1페이지로 totalCount를 얻고, 남은 페이지는 동시성 제한을 걸어 전량 수집한다. */
async function callAll(type, lawd, ym) {
  const first = await call(type, lawd, ym, 1);
  const total = first.total;
  const pages = Math.min(Math.ceil(total / PER_PAGE), MAX_PAGES);
  if (pages <= 1) return { items: first.items, total, truncated: false, failedPages: [] };

  const restPages = Array.from({ length: pages - 1 }, (_, i) => i + 2);
  const { results, failed } = await pool(restPages, CONCURRENCY, (p) => call(type, lawd, ym, p).then((r) => r.items));
  return {
    items: [first.items, ...results.filter(Boolean)].flat(),
    total,
    truncated: total > MAX_PAGES * PER_PAGE,
    failedPages: failed.map((f) => restPages[f.index]),
  };
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

    // 전량 수집: 필터·정렬·페이지네이션은 클라이언트가 전체 집합 위에서 수행한다.
    const { items, total, truncated, failedPages } = await callAll(type, lawd, ym);
    const rows = items.map((it) => normalize(type, it))
      .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
    return res.status(200).json({
      ok: true, type, count: rows.length, total, truncated,
      failedPages: failedPages.length ? failedPages : undefined,
      rows,
    });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "실거래가") });
  }
}
