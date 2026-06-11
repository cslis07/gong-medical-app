// Vercel Serverless Function — 공공데이터포털(국립중앙의료원) 응급/병의원/약국 API 프록시
// 브라우저에서 직접 호출하면 (1) CORS 차단 (2) 서비스키 노출 문제가 있으므로
// 서버에서 대신 호출하고 XML 응답을 JSON 으로 변환해서 돌려준다.
import { XMLParser } from "fast-xml-parser";

// 일반 인증키(Decoding)는 절대 소스코드에 넣지 않는다 (공개 저장소 유출 방지).
// 로컬: gitignore 된 .env 파일, 운영: Vercel 환경변수 DATA_API_KEY 로 주입.
// 모듈 로드 시점이 아닌 요청 시점에 읽어 .env 지연 로딩과도 호환되게 한다.

// service 별 base URL (B552657 = 국립중앙의료원)
const SERVICES = {
  emergency: "https://apis.data.go.kr/B552657/ErmctInfoInqireService",
  hospital: "https://apis.data.go.kr/B552657/HsptlAsembySearchService",
  pharmacy: "https://apis.data.go.kr/B552657/ErmctInsttInfoInqireService",
};

// 프론트에서 전달 가능한 화이트리스트 파라미터 (서비스키 주입 공격 방지)
const ALLOWED_PARAMS = [
  "Q0", "Q1", "QD", "QT", "QN", "QZ", "ORD",
  "STAGE1", "STAGE2", "SM_TYPE",
  "WGS84_LON", "WGS84_LAT", "HPID",
  "pageNo", "numOfRows",
];

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false, // 코드값(00, 0830 등) 문자열 유지
  trimValues: true,
});

export default async function handler(req, res) {
  try {
    const SERVICE_KEY = process.env.DATA_API_KEY;
    if (!SERVICE_KEY) {
      return res.status(500).json({
        error: "DATA_API_KEY 환경변수가 설정되지 않았습니다. (.env 또는 Vercel 환경변수에 인증키 등록 필요)",
      });
    }
    const { service, op, ...rest } = req.query;

    const base = SERVICES[service];
    if (!base) {
      return res
        .status(400)
        .json({ error: `알 수 없는 service: ${service} (emergency|hospital|pharmacy)` });
    }
    if (!op || !/^[A-Za-z]+$/.test(op)) {
      return res.status(400).json({ error: `유효하지 않은 op: ${op}` });
    }

    const sp = new URLSearchParams();
    sp.set("serviceKey", SERVICE_KEY);
    sp.set("pageNo", "1");
    sp.set("numOfRows", "20");
    for (const key of ALLOWED_PARAMS) {
      const v = rest[key];
      if (v !== undefined && v !== "") sp.set(key, v);
    }

    const url = `${base}/${op}?${sp.toString()}`;
    const upstream = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const text = await upstream.text();

    // data.go.kr 장애 시 HTML/평문 에러가 올 수 있음
    if (!text.trim().startsWith("<")) {
      return res.status(502).json({ error: "공공데이터 API 비정상 응답", raw: text.slice(0, 300) });
    }

    const xml = parser.parse(text);
    const response = xml.response || {};
    const header = response.header || {};
    const body = response.body || {};

    // resultCode 00 이 정상. 그 외(인증실패 30, 트래픽초과 22 등)는 그대로 전달.
    const resultCode = header.resultCode ?? "";
    const resultMsg = header.resultMsg ?? "";

    let items = body.items?.item ?? [];
    if (!Array.isArray(items)) items = items ? [items] : [];

    return res.status(200).json({
      resultCode,
      resultMsg,
      totalCount: Number(body.totalCount ?? items.length),
      pageNo: Number(body.pageNo ?? 1),
      numOfRows: Number(body.numOfRows ?? items.length),
      items,
    });
  } catch (err) {
    const msg = err?.name === "TimeoutError" ? "공공데이터 API 응답 시간 초과" : String(err?.message || err);
    return res.status(500).json({ error: msg });
  }
}
