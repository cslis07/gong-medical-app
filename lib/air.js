// Vercel Serverless Function — 미세먼지/대기질 (한국환경공단 에어코리아, data.go.kr)
// 시도별 실시간 측정정보 + 미세먼지 예보. DATA_API_KEY 재사용. WAF 회피 위해 User-Agent 필요.

import { errorMessage } from "./respond.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";
const BASE = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc";
// 등급코드 1좋음 2보통 3나쁨 4매우나쁨
const GRADE = { "1": { t: "좋음", c: "ok" }, "2": { t: "보통", c: "warn" }, "3": { t: "나쁨", c: "busy" }, "4": { t: "매우나쁨", c: "full" } };

async function getJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(13000) });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return {}; }
}
const grade = (g) => GRADE[String(g)] || { t: "-", c: "" };

export default async function handler(req, res) {
  try {
    const KEY = process.env.DATA_API_KEY;
    if (!KEY) return res.status(200).json({ ok: false, needKey: true, message: "DATA_API_KEY가 설정되지 않았습니다." });
    const sido = String(req.query.sido || "서울").trim();
    const key = encodeURIComponent(KEY);
    const rtUrl = (s) => `${BASE}/getCtprvnRltmMesureDnsty?serviceKey=${key}&sidoName=${encodeURIComponent(s)}&returnType=json&ver=1.3&numOfRows=100&pageNo=1`;
    const pickItems = (j) => { let x = j?.response?.body?.items ?? []; return Array.isArray(x) ? x : (x ? [x] : []); };

    // 수도권(서울·경기·인천) 평균 — 헤더 배지용
    if (String(req.query.op) === "metro") {
      const parts = await Promise.all(["서울", "경기", "인천"].map((s) => getJson(rtUrl(s))));
      const all = parts.flatMap(pickItems);
      const nums = (f) => all.map((it) => Number(it[f])).filter((v) => Number.isFinite(v) && v >= 0);
      const mean = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
      const pm10 = mean(nums("pm10Value")), pm25 = mean(nums("pm25Value"));
      return res.status(200).json({ ok: true, region: "수도권", pm10, pm25, stations: all.length });
    }

    // 시도별 실시간 측정정보 + 대기질 예보(PM10·PM2.5, 오늘·내일·모레) 병렬
    // ⚠️ searchDate=오늘이면 아직 발표 전이라 빈 응답이 잦다. 어제·오늘 발표를 함께 받아
    //    대상일(informData)별로 가장 최신 발표를 고른다.
    const dstr = (off) => { const d = new Date(Date.now() + 9 * 3600e3 + off * 864e5); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`; };
    const today = dstr(0), yesterday = dstr(-1);
    const fcUrl = (code, sd) => `${BASE}/getMinuDustFrcstDspth?serviceKey=${key}&returnType=json&searchDate=${sd}&InformCode=${code}&numOfRows=30&pageNo=1`;
    const [rt, fc10t, fc10y, fc25t, fc25y] = await Promise.all([
      getJson(rtUrl(sido)),
      getJson(fcUrl("PM10", today)), getJson(fcUrl("PM10", yesterday)),
      getJson(fcUrl("PM25", today)), getJson(fcUrl("PM25", yesterday)),
    ]);

    const items = pickItems(rt);
    const stations = items.map((it) => ({
      station: it.stationName, time: it.dataTime,
      pm10: Number(it.pm10Value) || null, pm10Grade: grade(it.pm10Grade1h || it.pm10Grade),
      pm25: Number(it.pm25Value) || null, pm25Grade: grade(it.pm25Grade1h || it.pm25Grade),
      khai: Number(it.khaiValue) || null, khaiGrade: grade(it.khaiGrade),
      o3: Number(it.o3Value) || null,
    })).filter((s) => s.pm10 != null || s.pm25 != null);

    // 시도 평균
    const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
    const summary = {
      pm10: avg(stations.map((s) => s.pm10).filter((v) => v != null)),
      pm25: avg(stations.map((s) => s.pm25).filter((v) => v != null)),
    };

    // 예보문 — API가 InformCode 필터를 무시하고 섞어 주므로 코드로 거르고,
    // 대상일(오늘/내일/모레)별로 가장 최신 발표(dataTime 최댓값)를 고른다.
    const itemsOf = (j) => { let a = j?.response?.body?.items ?? []; return Array.isArray(a) ? a : (a ? [a] : []); };
    const LABEL = { [dstr(0)]: "오늘", [dstr(1)]: "내일", [dstr(2)]: "모레" };
    const buildDays = (js, code) => {
      const all = js.flatMap(itemsOf).filter((x) => x.informCode === code);
      return [dstr(0), dstr(1), dstr(2)].map((dt) => {
        const cand = all.filter((x) => x.informData === dt).sort((p, q) => String(q.dataTime || "").localeCompare(String(p.dataTime || "")));
        const it = cand[0];
        if (!it) return null;
        // informGrade 예: "서울 : 나쁨,인천 : 보통,경기북부 : 나쁨,..."
        const m = String(it.informGrade || "").split(",").map((s) => s.trim()).find((s) => s.startsWith(sido));
        const sidoGrade = m ? m.split(":")[1]?.trim() || "" : "";
        return { label: LABEL[dt], date: dt, overall: it.informOverall, cause: it.informCause, sidoGrade };
      }).filter(Boolean);
    };
    const forecast10 = buildDays([fc10t, fc10y], "PM10");
    const forecast25 = buildDays([fc25t, fc25y], "PM25");
    // 하위호환: 기존 필드는 오늘(첫 항목) 유지
    const forecast = forecast10[0] || null, forecastPm25 = forecast25[0] || null;

    return res.status(200).json({ ok: true, sido, summary, forecast, forecastPm25, forecast10, forecast25, stations: stations.sort((a, b) => (b.pm10 || 0) - (a.pm10 || 0)) });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "대기질") });
  }
}
