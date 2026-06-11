// Vercel Serverless Function — 서울 열린데이터광장 "서울시 공공서비스예약" 프록시
// 호스트/구조가 data.go.kr 과 달라 별도 엔드포인트로 분리.
// 서울 OpenAPI: http://openapi.seoul.go.kr:8088/{KEY}/json/{SERVICE}/{START}/{END}/
// 키는 경로에 들어가므로 절대 프론트로 노출하지 않고 서버에서만 사용한다. (계정당 1키)

const SEOUL_SERVICES = {
  all: "tvYeyakCOllect",
  culture: "ListPublicReservationCulture",
  education: "ListPublicReservationEducation",
  medical: "ListPublicReservationMedical",
  sport: "ListPublicReservationSport",
  institution: "ListPublicReservationInstitution",
};

export default async function handler(req, res) {
  try {
    const KEY = process.env.SEOUL_API_KEY;
    if (!KEY) {
      return res.status(500).json({
        error: "SEOUL_API_KEY 환경변수가 설정되지 않았습니다. (.env 또는 Vercel 환경변수 등록 필요)",
      });
    }

    const cat = String(req.query.cat || "all");
    const svc = SEOUL_SERVICES[cat];
    if (!svc) {
      return res.status(400).json({ error: `알 수 없는 cat: ${cat} (${Object.keys(SEOUL_SERVICES).join("|")})` });
    }

    // 페이지 범위 (서울 API 는 1회 최대 1000건)
    let start = parseInt(req.query.start, 10);
    let end = parseInt(req.query.end, 10);
    if (!Number.isInteger(start) || start < 1) start = 1;
    if (!Number.isInteger(end) || end < start) end = start + 299;
    if (end - start > 999) end = start + 999;

    const url = `http://openapi.seoul.go.kr:8088/${KEY}/json/${svc}/${start}/${end}/`;
    const upstream = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const text = await upstream.text();

    let json;
    try { json = JSON.parse(text); }
    catch { return res.status(502).json({ error: "서울 OpenAPI 비정상 응답", raw: text.slice(0, 300) }); }

    const root = json[svc] || json;
    const code = root?.RESULT?.CODE ?? json?.RESULT?.CODE ?? "";
    const message = root?.RESULT?.MESSAGE ?? json?.RESULT?.MESSAGE ?? "";
    const rows = Array.isArray(root?.row) ? root.row : [];

    return res.status(200).json({
      code,
      message,
      total: Number(root?.list_total_count ?? rows.length),
      rows,
    });
  } catch (err) {
    const msg = err?.name === "TimeoutError" ? "서울 OpenAPI 응답 시간 초과" : String(err?.message || err);
    return res.status(500).json({ error: msg });
  }
}
