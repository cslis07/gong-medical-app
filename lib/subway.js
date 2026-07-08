// Vercel Serverless Function — 서울 지하철 (실시간 + 역정보/편의시설 + 확장)
// 실시간(도착/위치/일괄): host swopenapi.seoul.go.kr, SEOUL_REALTIME_KEY
// 정보(역검색/통계/시설 등): host openapi.seoul.go.kr:8088, SEOUL_API_KEY (계정 단위 키로 전 데이터셋 호출 가능)
// 모든 kind는 q(역명)·line(호선) 필터를 지원하고, 둘 다 없으면 전체 조회한다.

const BASE = "http://openapi.seoul.go.kr:8088";
const RT_BASE = "http://swopenapi.seoul.go.kr/api/subway";

// subwayId → 호선명 (실시간 필터용, 서울시 공식 코드표)
const LINE_SUBWAY_ID = {
  "1호선": "1001", "2호선": "1002", "3호선": "1003",
  "4호선": "1004", "5호선": "1005", "6호선": "1006",
  "7호선": "1007", "8호선": "1008", "9호선": "1009",
  "경의중앙선": "1063", "공항철도": "1065", "경춘선": "1067",
  "수인분당선": "1075", "신분당선": "1077", "경강선": "1081",
  "우이신설선": "1092", "서해선": "1093", "신림선": "1094",
  "GTX-A": "1032",
};

// 호선명 표기 변형 비교 — "2호선" vs "02호선" vs "2" 모두 동일 취급
function lineVariants(line) {
  const m = line.match(/^0?(\d+)호선$/);
  if (m) return new Set([`${m[1]}호선`, `0${m[1]}호선`, m[1], `0${m[1]}`]);
  return new Set([line]);
}
function lineMatch(val, line) {
  if (!line) return true;
  return lineVariants(line).has(String(val ?? "").trim());
}

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(14000) });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { _raw: t.slice(0, 300) }; }
}

// Seoul openapi 표준 호출 — {BASE}/{KEY}/json/{svc}/{start}/{end}/{...params}/
async function fetchSeoul(KEY, svc, start, end, ...pathParams) {
  const extras = pathParams
    .filter(p => p !== undefined && p !== null && String(p) !== "")
    .map(p => encodeURIComponent(p))
    .join("/");
  const url = `${BASE}/${KEY}/json/${svc}/${start}/${end}${extras ? "/" + extras : ""}/`;
  return getJson(url);
}

// 표준 rows 추출
function seoulRows(j, svc) {
  const root = j[svc] || {};
  return {
    code: root.RESULT?.CODE ?? "INFO-000",
    message: root.RESULT?.MESSAGE ?? "",
    total: root.list_total_count ?? 0,
    rows: Array.isArray(root.row) ? root.row : (root.row ? [root.row] : []),
  };
}

// XML 전용 서비스 파싱 (airPolutionInfo 등) — <row><TAG>값</TAG>…</row>
function parseXmlRows(xml) {
  const rows = [];
  const rowRe = /<row>([\s\S]*?)<\/row>/g;
  const tagRe = /<([A-Za-z_][\w]*)>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = rowRe.exec(xml))) {
    const obj = {};
    let t;
    while ((t = tagRe.exec(m[1]))) obj[t[1]] = t[2].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
    rows.push(obj);
  }
  return rows;
}

// q·line 공통 필터 적용 후 반환
function filtered(result, { q, line, qField, lineField, limit = 300 }) {
  let rows = result.rows;
  if (q && qField) rows = rows.filter(r => String(r[qField] ?? "").includes(q));
  if (line && lineField) rows = rows.filter(r => lineMatch(r[lineField], line));
  return { ...result, rows: rows.slice(0, limit), total: rows.length };
}

export default async function handler(req, res) {
  try {
    const kind = String(req.query.kind || "");
    const q = String(req.query.q || "").trim();
    const line = String(req.query.line || "").trim();

    // ── 실시간 (swopenapi.seoul.go.kr, SEOUL_REALTIME_KEY) ──────────────────
    if (["arrival", "position", "arrivalAll"].includes(kind)) {
      const KEY = process.env.SEOUL_REALTIME_KEY;
      if (!KEY) return res.status(500).json({ error: "SEOUL_REALTIME_KEY 환경변수가 없습니다." });

      // 역명 있으면 해당 역, 없으면 일괄(ALL) 후 호선 필터
      if (kind === "arrival" || kind === "arrivalAll") {
        let rows = [];
        let code = "INFO-000", message = "";
        if (q) {
          const j = await getJson(`${RT_BASE}/${KEY}/json/realtimeStationArrival/0/50/${encodeURIComponent(q)}`);
          rows = Array.isArray(j.realtimeArrivalList) ? j.realtimeArrivalList : [];
          code = j.errorMessage?.code ?? j.code ?? "INFO-000";
          message = j.errorMessage?.message ?? "";
        } else {
          const j = await getJson(`${RT_BASE}/${KEY}/json/realtimeStationArrival/ALL`);
          rows = Array.isArray(j.realtimeArrivalList) ? j.realtimeArrivalList : [];
          code = j.errorMessage?.code ?? j.code ?? "INFO-000";
          message = j.errorMessage?.message ?? "";
        }
        if (line) {
          const lineId = LINE_SUBWAY_ID[line];
          rows = rows.filter(r => r.subwayNm === line || (lineId && r.subwayId === lineId));
        }
        rows = rows.slice(0, 200);
        return res.status(200).json({ code, message, total: rows.length, rows });
      }

      if (kind === "position") {
        // 호선 지정 시 단건, 미지정 시 1~9호선 병렬 조회(전체)
        const lines = line ? [line] : ["1호선","2호선","3호선","4호선","5호선","6호선","7호선","8호선","9호선"];
        const results = await Promise.allSettled(lines.map(l =>
          getJson(`${RT_BASE}/${KEY}/json/realtimePosition/0/100/${encodeURIComponent(l)}`)
        ));
        let rows = [];
        for (const r of results) {
          if (r.status === "fulfilled" && Array.isArray(r.value.realtimePositionList))
            rows = rows.concat(r.value.realtimePositionList);
        }
        if (q) rows = rows.filter(r => String(r.statnNm ?? "").includes(q));
        rows = rows.slice(0, 300);
        return res.status(200).json({ code: "INFO-000", message: "", total: rows.length, rows });
      }
    }

    // ── 정보 계열 (openapi.seoul.go.kr, SEOUL_API_KEY) ─────────────────────
    const KEY = process.env.SEOUL_API_KEY;
    if (!KEY) return res.status(500).json({ error: "SEOUL_API_KEY 환경변수가 없습니다." });

    // 역명 검색 — q 있으면 역명검색 서비스, 없으면 전체 역 목록
    if (kind === "stationInfo") {
      if (q) {
        const j = await getJson(`${BASE}/${KEY}/json/SearchInfoBySubwayNameService/1/100/${encodeURIComponent(q)}`);
        const result = seoulRows(j, "SearchInfoBySubwayNameService");
        return res.status(200).json(filtered(result, { line, lineField: "LINE_NUM" }));
      }
      const j = await fetchSeoul(KEY, "SearchSTNBySubwayLineInfo", 1, 1000);
      const result = seoulRows(j, "SearchSTNBySubwayLineInfo");
      return res.status(200).json(filtered(result, { line, lineField: "LINE_NUM" }));
    }

    // 노선별 역 목록
    if (kind === "stationList") {
      const j = await fetchSeoul(KEY, "SearchSTNBySubwayLineInfo", 1, 1000);
      const result = seoulRows(j, "SearchSTNBySubwayLineInfo");
      return res.status(200).json(filtered(result, { q, line, qField: "STATION_NM", lineField: "LINE_NUM" }));
    }

    // 노선도 데이터 — 좌표(subwayStationMaster) + 순서(SearchSTNBySubwayLineInfo) 조인
    if (kind === "mapData") {
      const normRoute = (r) => String(r || "").replace(/^0(\d호선)$/, "$1").trim();
      const normName = (s) => String(s || "").replace(/\(.*?\)/g, "").trim();
      const [mRes, lRes] = await Promise.all([
        fetchSeoul(KEY, "subwayStationMaster", 1, 1000),
        fetchSeoul(KEY, "SearchSTNBySubwayLineInfo", 1, 1000),
      ]);
      const master = seoulRows(mRes, "subwayStationMaster").rows;   // BLDN_NM, ROUTE, LAT, LOT
      const lineInfo = seoulRows(lRes, "SearchSTNBySubwayLineInfo").rows; // STATION_NM, LINE_NUM, FR_CODE

      // 좌표 조회 (이름+호선 우선, 이름만 폴백)
      const coordByKey = new Map();
      const coordByName = new Map();
      const stMap = new Map(); // 역 dot (이름 기준 중복 제거)
      for (const r of master) {
        const nm = normName(r.BLDN_NM), route = normRoute(r.ROUTE);
        const lat = Number(r.LAT), lon = Number(r.LOT);
        if (!lat || !lon) continue;
        coordByKey.set(nm + "|" + route, { lat, lon });
        if (!coordByName.has(nm)) coordByName.set(nm, { lat, lon });
        if (!stMap.has(nm)) stMap.set(nm, { nm, lat, lon, lines: [] });
        if (!stMap.get(nm).lines.includes(route)) stMap.get(nm).lines.push(route);
      }
      // 노선별 순서대로 좌표 연결
      const linesMap = new Map();
      for (const r of lineInfo) {
        const route = normRoute(r.LINE_NUM), nm = normName(r.STATION_NM);
        const c = coordByKey.get(nm + "|" + route) || coordByName.get(nm);
        if (!c) continue;
        if (!linesMap.has(route)) linesMap.set(route, []);
        linesMap.get(route).push({ nm, fr: Number(r.FR_CODE) || 0, lat: c.lat, lon: c.lon });
      }
      const lines = [];
      for (const [route, arr] of linesMap) {
        arr.sort((a, b) => a.fr - b.fr);
        lines.push({ line: route, stations: arr });
      }
      const stations = [...stMap.values()];
      return res.status(200).json({ code: "INFO-000", lines, stations, total: stations.length });
    }

    // 편의시설 (SeoulMetroFaciInfo — 호선 필드 없음, 역명 필터만)
    if (kind === "facility") {
      const svc = "SeoulMetroFaciInfo";
      let all = [];
      for (let s = 1; s <= 3001; s += 1000) {
        const j = await getJson(`${BASE}/${KEY}/json/${svc}/${s}/${s + 999}/`);
        const root = j[svc] || {};
        const rows = Array.isArray(root.row) ? root.row : [];
        all = all.concat(rows);
        if (rows.length < 1000) break;
      }
      const filt = q ? all.filter(x => String(x.STN_NM || "").includes(q)) : all;
      return res.status(200).json({ code: "INFO-000", total: filt.length, rows: filt.slice(0, 300) });
    }

    // 출입구 임시폐쇄 공사현황
    if (kind === "closure") {
      const j = await fetchSeoul(KEY, "TbSubwayLineDetail", 1, 500);
      const result = seoulRows(j, "TbSubwayLineDetail");
      return res.status(200).json(filtered(result, { q, line, qField: "SBWY_STNS_NM", lineField: "LINE" }));
    }

    // 첫차/막차 — 호선 미지정(전체) 시 1~8호선 병렬 조회
    if (kind === "firstlast") {
      const svc = "SearchFirstAndLastTrainbyLineServiceNew";
      const updn = { "상행": "1", "하행": "2" }[String(req.query.updn || "").trim()] || "1";
      const dow  = { "평일": "1", "토요일": "2", "일요일": "3" }[String(req.query.dow || "").trim()] || "1";
      const lines = line ? [line] : ["1호선","2호선","3호선","4호선","5호선","6호선","7호선","8호선"];
      const results = await Promise.allSettled(lines.map(l => fetchSeoul(KEY, svc, 1, 200, l, updn, dow)));
      let rows = [];
      for (const r of results) {
        if (r.status === "fulfilled") rows = rows.concat(seoulRows(r.value, svc).rows);
      }
      if (q) rows = rows.filter(r => String(r.STTN ?? "").includes(q));
      return res.status(200).json({ code: "INFO-000", message: "", total: rows.length, rows: rows.slice(0, 400) });
    }

    // 실내공기질 — XML 전용 서비스 (airPolutionInfo), LINE은 "1"·"2" 숫자 표기
    if (kind === "airquality") {
      const r = await fetch(`${BASE}/${KEY}/xml/airPolutionInfo/1/500/`, { signal: AbortSignal.timeout(14000) });
      const xml = await r.text();
      const code = (xml.match(/<CODE>(.*?)<\/CODE>/) || [])[1] ?? "INFO-000";
      const result = { code, message: "", total: 0, rows: parseXmlRows(xml) };
      return res.status(200).json(filtered(result, { q, line, qField: "AREA_NM", lineField: "LINE" }));
    }

    // 장애인/노약자 편의시설 현황 — OdblrDspsnCvntl (274건)
    if (kind === "accessibility") {
      const j = await fetchSeoul(KEY, "OdblrDspsnCvntl", 1, 300);
      const result = seoulRows(j, "OdblrDspsnCvntl");
      return res.status(200).json(filtered(result, { q, line, qField: "SBWY_STNS_NM", lineField: "SBWY_ROUT_LN" }));
    }

    // 호선별 역별 승하차 통계 — 원본은 일별(USE_YMD).
    //   YYYYMMDD 입력 → 해당 일자, YYYYMM 입력 → 그 달 전체 일자를 합산한 월 통계.
    if (kind === "stats") {
      const ymRaw = String(req.query.ym || "").trim();
      const station = String(req.query.station || "").trim();

      // 특정 날짜의 일별 통계 1건 조회 헬퍼
      const fetchDay = (date) => line
        ? fetchSeoul(KEY, "CardSubwayStatsNew", 1, 700, date, line)
        : fetchSeoul(KEY, "CardSubwayStatsNew", 1, 700, date);
      const dayRows = (j) => {
        let rows = seoulRows(j, "CardSubwayStatsNew").rows;
        if (station) rows = rows.filter(x => String(x.SBWY_STNS_NM || "").includes(station));
        return rows;
      };

      // 단일 일자
      if (/^\d{8}$/.test(ymRaw)) {
        const rows = dayRows(await fetchDay(ymRaw));
        return res.status(200).json({ code: "INFO-000", message: "", total: rows.length, rows });
      }

      // 월 합산 (YYYYMM)
      if (/^\d{6}$/.test(ymRaw)) {
        const year = +ymRaw.slice(0, 4), mon = +ymRaw.slice(4, 6);
        const days = new Date(year, mon, 0).getDate(); // 해당 월 일수
        const dates = Array.from({ length: days }, (_, i) => `${ymRaw}${String(i + 1).padStart(2, "0")}`);
        const settled = await Promise.allSettled(dates.map(fetchDay));
        const agg = new Map(); // 호선|역명 → 합산
        for (const s of settled) {
          if (s.status !== "fulfilled") continue;
          for (const x of dayRows(s.value)) {
            const key = `${x.SBWY_ROUT_LN_NM}|${x.SBWY_STNS_NM}`;
            const cur = agg.get(key) || { USE_YMD: ymRaw, SBWY_ROUT_LN_NM: x.SBWY_ROUT_LN_NM, SBWY_STNS_NM: x.SBWY_STNS_NM, GTON_TNOPE: 0, GTOFF_TNOPE: 0, DAYS: 0 };
            cur.GTON_TNOPE += Number(x.GTON_TNOPE || 0);
            cur.GTOFF_TNOPE += Number(x.GTOFF_TNOPE || 0);
            cur.DAYS += 1;
            agg.set(key, cur);
          }
        }
        const rows = [...agg.values()]
          .sort((a, b) => (b.GTON_TNOPE + b.GTOFF_TNOPE) - (a.GTON_TNOPE + a.GTOFF_TNOPE))
          .slice(0, 200);
        return res.status(200).json({ code: "INFO-000", message: `${ymRaw} 월 합계`, total: rows.length, rows });
      }

      return res.status(400).json({ error: "연월(YYYYMM) 또는 일자(YYYYMMDD)를 입력하세요." });
    }

    // 시간대별 승하차 — 월별 데이터 (YYYYMM)
    if (kind === "timeStats") {
      let ym = String(req.query.ym || "").trim();
      const station = String(req.query.station || "").trim();
      if (/^\d{8}$/.test(ym)) ym = ym.slice(0, 6); // YYYYMMDD 입력 시 연월로 보정
      if (line && station) {
        const j = await fetchSeoul(KEY, "CardSubwayTime", 1, 100, ym, line, station);
        return res.status(200).json(seoulRows(j, "CardSubwayTime"));
      }
      if (line) {
        const j = await fetchSeoul(KEY, "CardSubwayTime", 1, 200, ym, line);
        return res.status(200).json(seoulRows(j, "CardSubwayTime"));
      }
      const j = await fetchSeoul(KEY, "CardSubwayTime", 1, 700, ym);
      const result = seoulRows(j, "CardSubwayTime");
      return res.status(200).json(filtered(result, { q: station, qField: "STTN", limit: 200 }));
    }

    // 엘리베이터·리프트 위치 — tbTraficElvtr(552건) + tbTraficEntrcLft(83건) 통합
    if (kind === "elevatorLift") {
      const [elev, lift] = await Promise.all([
        fetchSeoul(KEY, "tbTraficElvtr", 1, 600),
        fetchSeoul(KEY, "tbTraficEntrcLft", 1, 200),
      ]);
      let rows = [];
      for (const r of seoulRows(elev, "tbTraficElvtr").rows) rows.push({ ...r, FAC_TYPE: "엘리베이터" });
      for (const r of seoulRows(lift, "tbTraficEntrcLft").rows) rows.push({ ...r, FAC_TYPE: "리프트" });
      if (q) rows = rows.filter(r => String(r.SBWY_STN_NM || "").includes(q));
      rows = rows.slice(0, 300);
      return res.status(200).json({ code: "INFO-000", message: "", total: rows.length, rows });
    }

    // 행정동별 총 승차 승객수 — tpssSubwayPassenger (최신일·승차多 순 상위)
    if (kind === "areaStats") {
      const j = await fetchSeoul(KEY, "tpssSubwayPassenger", 1, 1000);
      const result = seoulRows(j, "tpssSubwayPassenger");
      const latest = result.rows.reduce((mx, r) => (r.CRTR_DD > mx ? r.CRTR_DD : mx), "");
      let rows = result.rows
        .filter(r => r.CRTR_DD === latest && Number(r.SBWY_PSNG) > 0)
        .sort((a, b) => Number(b.SBWY_PSNG) - Number(a.SBWY_PSNG));
      if (q) rows = rows.filter(r => String(r.DONG_ID ?? "").includes(q));
      rows = rows.slice(0, 100);
      return res.status(200).json({ ...result, rows, total: rows.length });
    }

    // 최단경로 — getShtrmPath/{출발역}/{도착역}/{yyyy-MM-dd HH:mm:ss}
    if (kind === "shortestPath") {
      const dep = String(req.query.dep || "").trim();
      const arr = String(req.query.arr || "").trim();
      if (!dep || !arr) return res.status(400).json({ error: "출발역(dep)과 도착역(arr)이 필요합니다." });
      const d = new Date(Date.now() + 9 * 3600 * 1000); // KST
      const dt = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")} ${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}:00`;
      const url = `${BASE}/${KEY}/json/getShtrmPath/1/5/${encodeURIComponent(dep)}/${encodeURIComponent(arr)}/${encodeURIComponent(dt)}`;
      const j = await getJson(url);
      const ok = j.header?.resultCode === "00";
      if (!ok) return res.status(200).json({ code: j.header?.resultCode ?? "ERR", message: j.header?.resultMsg ?? (j._raw || "조회 실패"), total: 0, rows: [] });
      return res.status(200).json({ code: "INFO-000", message: "", total: 1, rows: [j.body] });
    }

    return res.status(400).json({ error: `알 수 없는 kind: ${kind}` });
  } catch (err) {
    const msg = err?.name === "TimeoutError" ? "지하철 API 응답 시간 초과" : String(err?.message || err);
    return res.status(500).json({ error: msg });
  }
}
