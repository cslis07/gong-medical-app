// Vercel Serverless Function — 서울 실시간 인구 혼잡도 (서울 열린데이터광장 citydata_ppltn)
// 서울 주요 핫스팟의 실시간 혼잡도 단계·추정 인구를 조회한다. SEOUL_API_KEY 재사용.
// 참고: k-skill seoul-density (원문은 자체 proxy 경유, 여기서는 동일 공개 API를 직접 호출).

const BASE = "http://openapi.seoul.go.kr:8088";

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(14000) });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { _raw: t.slice(0, 300) }; }
}

export default async function handler(req, res) {
  try {
    const area = String(req.query.area || "").trim();
    if (!area) return res.status(400).json({ error: "장소명(area)이 필요합니다. 예: 강남역" });

    const KEY = process.env.SEOUL_API_KEY;
    if (!KEY) return res.status(500).json({ error: "SEOUL_API_KEY 환경변수가 설정되지 않았습니다." });

    // citydata_ppltn/{start}/{end}/{장소명}
    const url = `${BASE}/${KEY}/json/citydata_ppltn/1/5/${encodeURIComponent(area)}/`;
    const j = await getJson(url);

    const rows = j["SeoulRtd.citydata_ppltn"] || [];
    const result = j.RESULT || {};
    const code = result["RESULT.CODE"] || (rows.length ? "INFO-000" : "INFO-200");
    if (!rows.length) {
      return res.status(200).json({ code, message: result["RESULT.MESSAGE"] || "해당 장소의 실시간 데이터가 없습니다.", rows: [] });
    }
    // 필요한 필드만 정리해서 반환
    const rows2 = rows.map((r) => ({
      area: r.AREA_NM,
      areaCd: r.AREA_CD,
      level: r.AREA_CONGEST_LVL,          // 여유 / 보통 / 약간 붐빔 / 붐빔
      msg: r.AREA_CONGEST_MSG,
      pplMin: r.AREA_PPLTN_MIN,
      pplMax: r.AREA_PPLTN_MAX,
      time: r.PPLTN_TIME,
      maleRate: r.MALE_PPLTN_RATE,
      femaleRate: r.FEMALE_PPLTN_RATE,
      ageRates: {
        "0-10": r.PPLTN_RATE_0, "10대": r.PPLTN_RATE_10, "20대": r.PPLTN_RATE_20,
        "30대": r.PPLTN_RATE_30, "40대": r.PPLTN_RATE_40, "50대": r.PPLTN_RATE_50,
        "60대": r.PPLTN_RATE_60, "70대+": r.PPLTN_RATE_70,
      },
      residentRate: r.RESNT_PPLTN_RATE,
      nonResidentRate: r.NON_RESNT_PPLTN_RATE,
    }));
    return res.status(200).json({ code: "INFO-000", rows: rows2 });
  } catch (err) {
    const msg = err?.name === "TimeoutError" ? "혼잡도 API 응답 시간 초과" : String(err?.message || err);
    return res.status(500).json({ error: msg });
  }
}
