// Vercel Serverless Function — LH 분양·임대 공고 (한국토지주택공사, data.go.kr)
// B552555/lhLeaseNoticeInfo1. DATA_API_KEY 재사용. WAF 회피 위해 User-Agent 필요.
// 응답이 [ {dsSch}, {dsList:[...], resHeader} ] 형태의 배열인 LH 특유 포맷을 방어적으로 파싱.
//
// ⚠️ 이 API는 날짜를 안 주면 **최근 2개월**만 준다(응답의 dsSch에 PAN_ST_DT/PAN_ED_DT가 찍혀 나온다).
//    2개월 = 744건, 2024-01-01부터 = 7,590건. 기본은 API 기본창을 따르고 from/to로 넓힌다.
// 총 건수는 헤더가 아니라 각 행의 ALL_CNT에 들어 있다.

import { pool } from "./pool.js";
import { errorMessage } from "./respond.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";
const PER_PAGE = 100;   // PG_SZ 상한
const MAX_PAGES = 40;   // 안전장치 (= 4,000건)
const CONCURRENCY = 4;  // LH 서버는 병렬 버스트에 약하다 — 40개를 한 번에 던지면 13개가 무응답
const MAX_WINDOW_DAYS = 366;  // from/to 조회창 상한 (미지정 시 API 기본 2개월)

// 문자열 필터는 길이를 제한한다(상위 API에 임의 길이 값을 넘기지 않는다).
const clip = (v, n) => String(v ?? "").trim().slice(0, n);
const isYmd = (v) => /^\d{8}$/.test(v);

function buildQs(req, page) {
  const qs = new URLSearchParams({
    serviceKey: process.env.DATA_API_KEY,
    PG_SZ: String(PER_PAGE),
    PAGE: String(page),
  });
  // 선택 필터: 지역코드(CNP_CD), 공고상태(PAN_SS), 공고명(PAN_NM), 유형(UPP_AIS_TP_CD)
  for (const [q, p] of [["region", "CNP_CD"], ["status", "PAN_SS"], ["name", "PAN_NM"], ["type", "UPP_AIS_TP_CD"]]) {
    const v = clip(req.query[q], 40);
    if (v) qs.set(p, v);
  }
  // 게시기간: 검증 없이 넘기면 요청 1건이 상위 API를 8회(기본 2개월)에서 40회까지 부풀린다.
  // YYYYMMDD 형식 + 최대 조회창(MAX_WINDOW_DAYS)을 강제한다.
  const from = clip(req.query.from, 8), to = clip(req.query.to, 8);
  if (isYmd(from) && isYmd(to)) {
    const d = (s) => new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`);
    const days = (d(to) - d(from)) / 86400000;
    if (days >= 0 && days <= MAX_WINDOW_DAYS) { qs.set("PAN_ST_DT", from); qs.set("PAN_ED_DT", to); }
  }
  return qs;
}

// 리스트 위치 방어적 탐색: 배열 최상위 / dsList / response.body 등
function digList(j) {
  const list = [];
  const dig = (o) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach(dig); return; }
    for (const [, v] of Object.entries(o)) {
      if (Array.isArray(v) && v.length && v[0] && typeof v[0] === "object" && (v[0].PAN_NM || v[0].PAN_ID)) list.push(...v);
      else if (typeof v === "object") dig(v);
    }
  };
  dig(j);
  return list;
}

async function callPage(req, page) {
  const r = await fetch(`https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1?${buildQs(req, page)}`, {
    headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(14000),
  });
  const t = await r.text();
  // 상위 응답 본문(WAF 차단 페이지 등)을 사용자에게 반사하지 않는다. 원문은 respond.js가 서버 로그로만 남긴다.
  let j; try { j = JSON.parse(t); } catch { throw new Error(`LH 응답이 JSON이 아님 (page ${page}, ${t.length}바이트)`); }
  const list = digList(j);
  return { list, total: Number(list[0]?.ALL_CNT) || 0 };
}

export default async function handler(req, res) {
  try {
    if (!process.env.DATA_API_KEY) return res.status(200).json({ ok: false, needKey: true, message: "DATA_API_KEY가 설정되지 않았습니다." });

    const first = await callPage(req, 1);
    const total = first.total;
    const pages = Math.min(Math.ceil(total / PER_PAGE), MAX_PAGES);

    const restPages = Array.from({ length: Math.max(pages - 1, 0) }, (_, i) => i + 2);
    const { results, failed } = await pool(restPages, CONCURRENCY, (p) => callPage(req, p).then((r) => r.list));
    const list = [first.list, ...results.filter(Boolean)].flat();

    const rows = list.map((it) => ({
      id: it.PAN_ID || "",
      name: it.PAN_NM || "",
      type: it.AIS_TP_CD_NM || it.UPP_AIS_TP_NM || "",
      region: it.CNP_CD_NM || "",
      status: it.PAN_SS || "",
      postDate: it.PAN_NT_ST_DT || "",
      closeDate: it.CLSG_DT || "",
      url: it.DTL_URL || "",
    })).filter((x) => x.name);

    // 같은 공고가 페이지 경계에서 중복되는 경우가 있어 PAN_ID로 한 번 거른다.
    const seen = new Set();
    const uniq = rows.filter((r) => (r.id && seen.has(r.id) ? false : (seen.add(r.id), true)));

    return res.status(200).json({
      ok: true, count: uniq.length, total,
      truncated: total > MAX_PAGES * PER_PAGE,
      // 페이지 수집 실패는 숨기지 않는다 — 조용히 빈 배열로 넘기면 건수가 말없이 줄어든다.
      failedPages: failed.length ? failed.map((f) => restPages[f.index]) : undefined,
      rows: uniq,
    });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "LH 공고") });
  }
}
