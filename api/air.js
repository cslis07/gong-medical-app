// Vercel Serverless Function — 미세먼지/대기질 (한국환경공단 에어코리아, data.go.kr)
// 시도별 실시간 측정정보 + 미세먼지 예보. DATA_API_KEY 재사용. WAF 회피 위해 User-Agent 필요.

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

    // 시도별 실시간 측정정보 + 대기질 예보(PM10) 병렬
    const now = new Date(Date.now() + 9 * 3600e3);
    const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
    const [rt, fc] = await Promise.all([
      getJson(`${BASE}/getCtprvnRltmMesureDnsty?serviceKey=${key}&sidoName=${encodeURIComponent(sido)}&returnType=json&ver=1.3&numOfRows=100&pageNo=1`),
      getJson(`${BASE}/getMinuDustFrcstDspth?serviceKey=${key}&returnType=json&searchDate=${today}&InformCode=PM10&numOfRows=10&pageNo=1`),
    ]);

    let items = rt?.response?.body?.items ?? [];
    if (!Array.isArray(items)) items = items ? [items] : [];
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

    // 예보문 (오늘 PM10)
    let fcItems = fc?.response?.body?.items ?? [];
    if (!Array.isArray(fcItems)) fcItems = fcItems ? [fcItems] : [];
    const forecast = fcItems[0] ? { overall: fcItems[0].informOverall, cause: fcItems[0].informCause, grade: fcItems[0].informGrade, date: fcItems[0].informData } : null;

    return res.status(200).json({ ok: true, sido, summary, forecast, stations: stations.sort((a, b) => (b.pm10 || 0) - (a.pm10 || 0)) });
  } catch (err) {
    const msg = err?.name === "TimeoutError" ? "대기질 API 응답 시간 초과" : String(err?.message || err);
    return res.status(500).json({ error: msg });
  }
}
