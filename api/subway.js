// Vercel Serverless Function — 서울 지하철 (실시간 + 역정보/편의시설)
// 실시간(도착/위치): host swopenapi.seoul.go.kr/api/subway, 별도 권한키 SEOUL_REALTIME_KEY
// 정보(역검색/편의시설): host openapi.seoul.go.kr:8088, 종합키 SEOUL_API_KEY
// ※ 실시간 서비스는 종합키로는 ERROR-338(권한없음) → 반드시 실시간 권한키 필요.

const INFO_SERVICES = {
  stationInfo: "SearchInfoBySubwayNameService", // 역명 검색(서버필터)
  facility: "SeoulMetroFaciInfo", // 엘리베이터/에스컬레이터(클라필터)
};

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { _raw: t.slice(0, 200) }; }
}

export default async function handler(req, res) {
  try {
    const kind = String(req.query.kind || "");

    // (A) 실시간 — 도착 / 위치
    if (kind === "arrival" || kind === "position") {
      const KEY = process.env.SEOUL_REALTIME_KEY;
      if (!KEY) return res.status(500).json({ error: "SEOUL_REALTIME_KEY 환경변수가 없습니다. (실시간 권한 키 필요)" });

      let url, listKey;
      if (kind === "arrival") {
        const q = String(req.query.q || "").trim();
        if (!q) return res.status(400).json({ error: "역명(q)이 필요합니다." });
        url = `http://swopenapi.seoul.go.kr/api/subway/${KEY}/json/realtimeStationArrival/0/20/${encodeURIComponent(q)}`;
        listKey = "realtimeArrivalList";
      } else {
        const line = String(req.query.line || "").trim();
        if (!line) return res.status(400).json({ error: "호선(line)이 필요합니다." });
        url = `http://swopenapi.seoul.go.kr/api/subway/${KEY}/json/realtimePosition/0/100/${encodeURIComponent(line)}`;
        listKey = "realtimePositionList";
      }
      const j = await getJson(url);
      const rows = Array.isArray(j[listKey]) ? j[listKey] : [];
      return res.status(200).json({
        code: j.errorMessage?.code ?? (rows.length ? "INFO-000" : ""),
        message: j.errorMessage?.message ?? "",
        total: rows.length,
        rows,
      });
    }

    // (B) 정보 — 역검색 / 편의시설 (종합키)
    const svc = INFO_SERVICES[kind];
    if (!svc) return res.status(400).json({ error: `알 수 없는 kind: ${kind} (arrival|position|stationInfo|facility)` });
    const KEY = process.env.SEOUL_API_KEY;
    if (!KEY) return res.status(500).json({ error: "SEOUL_API_KEY 환경변수가 없습니다." });
    const q = String(req.query.q || "").trim();

    if (kind === "stationInfo") {
      const tail = q ? `/${encodeURIComponent(q)}` : "/";
      const j = await getJson(`http://openapi.seoul.go.kr:8088/${KEY}/json/${svc}/1/50${tail}`);
      const root = j[svc] || {};
      const rows = Array.isArray(root.row) ? root.row : [];
      return res.status(200).json({ code: root.RESULT?.CODE ?? "", message: root.RESULT?.MESSAGE ?? "", total: root.list_total_count ?? rows.length, rows });
    }

    if (kind === "facility") {
      // 서버측 역명 필터를 지원하지 않아 전체(약 2800건)를 수집해 STN_NM 으로 거른다.
      let all = [];
      for (let s = 1; s <= 3001; s += 1000) {
        const j = await getJson(`http://openapi.seoul.go.kr:8088/${KEY}/json/${svc}/${s}/${s + 999}/`);
        const root = j[svc] || {};
        const rows = Array.isArray(root.row) ? root.row : [];
        all = all.concat(rows);
        if (rows.length < 1000) break;
      }
      const filt = q ? all.filter((x) => String(x.STN_NM || "").includes(q)) : all;
      return res.status(200).json({ code: "INFO-000", total: filt.length, rows: filt.slice(0, 300) });
    }
  } catch (err) {
    const msg = err?.name === "TimeoutError" ? "지하철 API 응답 시간 초과" : String(err?.message || err);
    return res.status(500).json({ error: msg });
  }
}
