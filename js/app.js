// ===== 공공의료 정보 찾기 — 프론트엔드 로직 (모드 확장판) =====
// 탭(서비스) → 모드(오퍼레이션) 구조.
// input: "region"(시도/시군구/기관명) | "geo"(GPS 위/경도)

const TABS = {
  // 서울 지하철 — 노선도 중심(역 클릭 시 실시간 도착·편의시설 등을 모달로 통합 표시)
  subway: {
    service: "subway",
    modes: [
      // ── 🗺️ 노선도 ── (역 클릭 시 모든 정보를 모달로 통합 표시)
      { id: "subwayMap",    group: "🗺️ 노선도",    label: "전체 노선도",     input: "subway", sub: "map",       kind: "mapData",      render: null,
        hint: "서울 지하철 공식 노선도입니다. +/− 로 확대·축소, 드래그로 이동하고, 위 검색창에 역 이름을 넣으면 실시간 도착·열차 위치·첫차/막차·최단경로·편의시설·승하차·공기질을 한 번에 봅니다." },
    ],
  },
};

let currentTab = "subway";
let currentMode = TABS.subway.modes[0];
// 시간대별 승하차 표시 모드: true=시간대 개별 항목, false=월 전체 합계만
let timeStatsDetail = true;

const $ = (id) => document.getElementById(id);

// ---------- 초기화 ----------
// 지하철 호선 목록
const SUBWAY_LINES = ["1호선","2호선","3호선","4호선","5호선","6호선","7호선","8호선","9호선","경의중앙선","수인분당선","신분당선","공항철도","경춘선","우이신설선","서해선","김포골드라인"];
function initSubLine() {
  const opts = SUBWAY_LINES.map((l) => `<option value="${l}">${l}</option>`).join("");
  const all = '<option value="">전체</option>';
  ["subLine", "stLine"].forEach((id) => { const el = $(id); if (el) el.innerHTML = all + opts; });
  // 첫차/막차는 서울교통공사 1~8호선만 제공
  const fl = $("flLine");
  if (fl) fl.innerHTML = '<option value="">전체 (1~8호선)</option>' +
    SUBWAY_LINES.slice(0, 8).map((l) => `<option value="${l}">${l}</option>`).join("");
  // 통계 연월 기본값: 전월
  const d = new Date(); d.setMonth(d.getMonth() - 1);
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const stYm = $("stYm"); if (stYm && !stYm.value) stYm.value = ym;
}

async function searchSubway() {
  const m = currentMode;
  const qs = new URLSearchParams({ kind: m.kind });
  let note = ""; // 조회 결과에 덧붙일 안내문

  if (m.sub === "ql") {
    const q = $("subQ").value.trim();   if (q)    qs.set("q",    q);
    const line = $("subLine").value;    if (line) qs.set("line", line);
  } else if (m.sub === "firstlast") {
    const line = $("flLine").value;     if (line) qs.set("line", line);
    const q = $("subQ").value.trim();   if (q)    qs.set("q",    q);
    const updn = $("flUpdn").value; if (updn) qs.set("updn", updn);
    const dow  = $("flDow").value;  if (dow)  qs.set("dow",  dow);
  } else if (m.sub === "stats") {
    const line = $("stLine").value;
    const stn  = $("stStn").value.trim();
    let ym     = $("stYm").value.trim();
    if (m.kind === "timeStats") {
      // 날짜(YYYYMMDD) → 시간대 개별 항목, 연월(YYYYMM) → 월 전체 합계만
      timeStatsDetail = /^\d{8}$/.test(ym);
      if (/^\d{8}$/.test(ym)) {
        note = `시간대별 상세는 월 단위로 제공됩니다 (${ym.slice(0, 4)}년 ${ym.slice(4, 6)}월 기준).`;
        ym = ym.slice(0, 6);
      }
    }
    if (line) qs.set("line",    line);
    if (stn)  qs.set("station", stn);
    if (ym)   qs.set("ym",      ym);
  } else if (m.sub === "path") {
    const dep = $("pathDep").value.trim(), arr = $("pathArr").value.trim();
    if (!dep || !arr) return setStatus("출발역과 도착역을 모두 입력하세요.", "warn");
    qs.set("dep", dep); qs.set("arr", arr);
  }
  // sub === "none": kind만 전달

  setStatus("조회 중…", "loading");
  $("results").innerHTML = "";
  try {
    const r = await fetch(`/api/subway?${qs.toString()}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    if (data.code && !["INFO-000", ""].includes(data.code))
      throw new Error(`API [${data.code}] ${data.message || ""}`);
    let rows = data.rows || [];
    if (!rows.length) return setStatus(note || "조회 결과가 없습니다.", "warn");
    // 역 정보: 노선도(역 클릭) 형태로 렌더
    if (m.id === "stationHub") {
      const lineSel = $("subLine").value;
      setStatus(`${rows.length}개 역 · 역을 누르면 상세 정보`, "ok");
      $("results").innerHTML = renderStationHub(rows, lineSel);
      return;
    }
    // 실내공기질: 등급(좋음/보통/나쁨) 필터·정렬 + 분포 요약
    if (m.id === "airquality") {
      rows = sortAirRows(rows);
      const c = { ok: 0, warn: 0, full: 0 };
      rows.forEach((it) => c[airLevel(airPm(it)).level]++);
      note = `좋음 ${c.ok} · 보통 ${c.warn} · 나쁨 ${c.full}`;
      if (!rows.length) return setStatus("해당 등급의 측정 결과가 없습니다.", "warn");
    }
    setStatus(`${rows.length}건 표시${note ? " · " + note : ""}`, note && m.id !== "airquality" ? "warn" : "ok");
    $("results").innerHTML = rows.map(m.render).join("");
  } catch (e) {
    showError(e.message, searchSubway);
  }
}

function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === tab));
  renderModeBar();
  setMode(TABS[tab].modes[0]);
}

function renderModeBar() {
  const modes = TABS[currentTab].modes;
  const bar = $("modes");
  const grouped = modes.some((m) => m.group);
  bar.className = grouped ? "modes grouped" : "modes";

  if (!grouped) {
    bar.innerHTML = modes.map((m) =>
      `<button class="mode" data-mode="${m.id}">${m.label}</button>`).join("");
  } else {
    // group 순서를 유지하며 카테고리별로 묶어 라벨과 함께 표시
    const order = [];
    const byGroup = {};
    for (const m of modes) {
      if (!byGroup[m.group]) { byGroup[m.group] = []; order.push(m.group); }
      byGroup[m.group].push(m);
    }
    bar.innerHTML = order.map((g) => `
      <div class="mode-group">
        <span class="mode-group-label">${g}</span>
        <div class="mode-group-items">${byGroup[g].map((m) =>
          `<button class="mode" data-mode="${m.id}">${m.label}</button>`).join("")}</div>
      </div>`).join("");
  }

  bar.querySelectorAll(".mode").forEach((b) =>
    b.addEventListener("click", () =>
      setMode(modes.find((m) => m.id === b.dataset.mode))));
}

function toggleGroup(cls, show) {
  document.querySelectorAll("." + cls).forEach((el) => el.style.display = show ? "" : "none");
}

function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll(".mode").forEach((b) =>
    b.classList.toggle("active", b.dataset.mode === mode.id));

  const t = mode.input; // region | geo | subway
  toggleGroup("region-only", t === "region");
  toggleGroup("geo-only", t === "geo");
  toggleGroup("subway-only", t === "subway");
  toggleGroup("severe-only", mode.id === "severe");
  if (t === "region") $("keyword-field").style.display = mode.keyword ? "" : "none";
  toggleGroup("bed-only", mode.id === "realtime"); // 병상 여유/포화 정렬
  if (t === "subway") {
    const sub = mode.sub;
    toggleGroup("sub-q",         sub === "ql" || sub === "firstlast"); // 역명은 첫차/막차에서도 필터로 사용
    toggleGroup("sub-line",      sub === "ql");
    toggleGroup("sub-firstlast", sub === "firstlast");
    toggleGroup("sub-stats",     sub === "stats");
    toggleGroup("sub-path",      sub === "path");
    toggleGroup("sub-air",       mode.id === "airquality"); // 공기질 등급 필터
    // 노선도 모드는 입력 컨트롤 박스 자체를 숨기고 지도만 표시
    const isMap = sub === "map";
    toggleGroup("sub-q",   !isMap && (sub === "ql" || sub === "firstlast"));
    $("subBtn").style.display = isMap ? "none" : "";
    document.querySelector(".controls").style.display = isMap ? "none" : "";
  } else {
    document.querySelector(".controls").style.display = "";
  }

  $("hint").textContent = mode.hint || (
    t === "geo" ? "📍 브라우저 위치 권한이 필요합니다. 가까운 순으로 정렬됩니다." : "");
  $("results").innerHTML = "";
  $("status").textContent = "";

  if (mode.sub === "map") showSubwayMap();
}

function setStatus(msg, type = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = "status " + type;
}

// 오류 시 재시도 버튼 표시 (공공 API 일시 장애 대비)
function showError(msg, retryFn) {
  const timeout = /시간 초과|timeout|Failed to fetch|network/i.test(msg);
  setStatus(`오류: ${msg}`, "error");
  $("results").innerHTML =
    `<div class="retry-box">
      <div class="retry-ico">${timeout ? "⏱️" : "⚠️"}</div>
      <p class="retry-msg">${esc(timeout ? "서버 응답이 지연되고 있습니다." : msg)}</p>
      <p class="retry-sub">공공 API가 일시적으로 불안정할 수 있습니다.</p>
      <button class="search-btn retry-btn">🔄 다시 시도</button>
    </div>`;
  const btn = $("results").querySelector(".retry-btn");
  if (btn && retryFn) btn.addEventListener("click", retryFn);
}

// ---------- 공통 유틸 ----------
const DAY = ["일", "월", "화", "수", "목", "금", "토"];
function todayHours(it) {
  const jsDay = new Date().getDay();
  const n = jsDay === 0 ? 7 : jsDay;
  const s = it[`dutyTime${n}s`], c = it[`dutyTime${n}c`];
  if (!s || !c) return "운영시간 정보 없음";
  return `오늘(${DAY[jsDay]}) ${fmt(s)} ~ ${fmt(c)}`;
}
const fmt = (t) => (t && t.length === 4 ? `${t.slice(0, 2)}:${t.slice(2)}` : t || "");
const num = (v) => (v === undefined || v === "" || v === null ? NaN : Number(v));
const disp = (v) => (Number.isNaN(v) ? "-" : v);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// 서울 API 응답은 HTML 엔티티(&#39; &middot; 등)로 인코딩되어 있어 디코딩 후 다시 esc 한다.
const _decEl = document.createElement("textarea");
const dec = (s) => { _decEl.innerHTML = String(s ?? ""); return _decEl.value; };
const fmtDT = (s) => (s ? String(s).slice(0, 16) : "");
// 서울예약 상세의 NOTICE/DTLCONT는 서식 있는 HTML 원문을 표시한다.
// 신뢰 출처(서울시 공식 API)이지만 방어적으로 스크립트·이벤트핸들러·위험 태그를 제거한다.
function sanitizeHtml(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = String(html ?? "");
  tpl.content.querySelectorAll("script,iframe,object,embed,link,style,meta,form,base").forEach((el) => el.remove());
  tpl.content.querySelectorAll("*").forEach((el) => {
    [...el.attributes].forEach((a) => {
      const name = a.name.toLowerCase();
      const val = String(a.value).replace(/\s+/g, "").toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(a.name);                 // onclick 등 제거
      else if ((name === "href" || name === "src") && val.startsWith("javascript:")) el.removeAttribute(a.name);
      else if (name === "srcdoc") el.removeAttribute(a.name);
    });
  });
  return tpl.innerHTML;
}
const telLink = (t) => (t ? `<a class="btn tel" href="tel:${esc(t).replace(/[^0-9]/g, "")}">📞 ${esc(t)}</a>` : "");
function mapLink(name, lat, lon) {
  if (!lat || !lon) return "";
  return `<a class="btn map" href="https://map.kakao.com/link/map/${encodeURIComponent(name)},${lat},${lon}" target="_blank" rel="noopener">🗺️ 지도</a>`;
}

// ---------- 지하철 렌더러 ----------
// 호선별 공식 노선 색상
const LINE_COLORS = {
  "1호선": "#0052A4", "2호선": "#00A84D", "3호선": "#EF7C1C",
  "4호선": "#00A5DE", "5호선": "#996CAC", "6호선": "#CD7C2F",
  "7호선": "#747F00", "8호선": "#E6186C", "9호선": "#BDB092",
  "경의중앙선": "#77C4A3", "공항철도": "#0090D2", "경춘선": "#0C8E72",
  "수인분당선": "#F5A200", "신분당선": "#D4003B", "경강선": "#003DA5",
  "우이신설선": "#B7C452", "서해선": "#8FC31F", "신림선": "#6789CA",
  "김포골드라인": "#AD8605", "GTX-A": "#9A6292",
  // 노선도 데이터셋(ROUTE) 추가 표기
  "경의선": "#77C4A3", "김포도시철도": "#AD8605", "용인경전철": "#509F22",
  "우이신설경전철": "#B7C452", "의정부경전철": "#FDA600",
  "인천2호선": "#ED8B00", "인천선": "#7CA8D5",
};
function lineColor(name) { return LINE_COLORS[name] || "#7c8597"; }
// subwayId → 호선명 (서울시 공식 코드표)
const SUBWAY_ID_NAME = {
  "1001": "1호선", "1002": "2호선", "1003": "3호선", "1004": "4호선",
  "1005": "5호선", "1006": "6호선", "1007": "7호선", "1008": "8호선",
  "1009": "9호선", "1063": "경의중앙선", "1065": "공항철도", "1067": "경춘선",
  "1075": "수인분당선", "1077": "신분당선", "1081": "경강선",
  "1092": "우이신설선", "1093": "서해선", "1094": "신림선", "1032": "GTX-A",
};
function lineBadge(name) {
  if (!name) return "";
  return `<span class="line-badge" style="background:${lineColor(name)}">${esc(name)}</span>`;
}

// "02호선" → "2호선" (색상·전달용 표준화)
function normLine(l) { return String(l || "").replace(/^0(\d호선)$/, "$1"); }

// 클릭 가능한 역 노드 (역 정보 노선도)
function stationNodeHtml(name, line, lineLabel) {
  const nm = esc(name || "");
  const color = LINE_COLORS[line] || "#687283";
  return `<button class="station-node" data-station="${nm}" data-line="${esc(line || "")}">
      <span class="node-dot" style="border-color:${color}"></span>
      <span class="node-name">${nm}</span>
      ${lineLabel ? `<span class="node-line">${esc(lineLabel)}</span>` : ""}
      <span class="node-go">›</span>
    </button>`;
}
// 단건 카드(범용 경로 대비) — 실제로는 stationHub가 special-case로 노선도를 그림
function renderStationNode(it) {
  return stationNodeHtml(it.STATION_NM, normLine(it.LINE_NUM), normLine(it.LINE_NUM));
}
// ===== 지도형 전체 노선도 =====
let _mapData = null;
async function showSubwayMap() {
  const host = $("results");
  setStatus("노선도를 불러오는 중…", "loading");
  host.innerHTML = `<p class="modal-loading">노선도를 불러오는 중…</p>`;
  try {
    if (!_mapData) {
      const r = await fetch("/api/subway?kind=mapData");
      _mapData = await r.json();
      if (!r.ok) throw new Error(_mapData.error || `HTTP ${r.status}`);
    }
    host.innerHTML = buildMapHtml(_mapData);
    setStatus(`서울 지하철 노선도 · 역 이름을 검색하면 상세 정보`, "ok");
    initMapZoom();
  } catch (e) {
    setStatus(`오류: ${e.message}`, "error");
    host.innerHTML = "";
  }
}

// 역명 → 대표 호선 (이미지 노선도 검색용)
let _stationLine = {};
function buildMapHtml(data) {
  const stations = data.stations || [];
  _stationLine = {};
  stations.forEach((s) => { _stationLine[s.nm] = (s.lines || [])[0] || ""; });
  const opts = stations.map((s) => `<option value="${esc(s.nm)}"></option>`).join("");

  return `
    <div class="map-wrap">
      <div class="map-search">
        <input id="mapStnInput" list="mapStnList" placeholder="역 이름 검색 → 상세 정보 (예: 강남, 서울역)" autocomplete="off" />
        <datalist id="mapStnList">${opts}</datalist>
        <button id="mapStnBtn" class="search-btn">정보 보기</button>
      </div>
      <p class="map-tip">공식 서울 지하철 노선도 · +/− 확대·축소 · 드래그로 이동 · 역 이름을 검색하면 상세 정보를 봅니다.</p>
      <div class="map-zoom">
        <button data-z="in" aria-label="확대">+</button>
        <button data-z="out" aria-label="축소">−</button>
        <button data-z="reset" aria-label="원래대로">⟲</button>
      </div>
      <div class="map-scroll">
        <img id="subwayMapImg" src="/img/subway-map.png" alt="서울 지하철 노선도" draggable="false" />
      </div>
    </div>`;
}

function openMapStation() {
  const v = ($("mapStnInput").value || "").trim();
  if (!v) return;
  // 정확 일치 우선, 없으면 부분 일치
  let nm = Object.keys(_stationLine).find((k) => k === v)
    || Object.keys(_stationLine).find((k) => k.includes(v));
  if (!nm) return setStatus(`'${v}' 역을 찾을 수 없습니다.`, "warn");
  openStationDetail(nm, _stationLine[nm]);
}

function initMapZoom() {
  const img = $("subwayMapImg");
  if (!img) return;
  const scroll = img.closest(".map-scroll");
  let z = 1, baseW = 0;

  const fit = () => { baseW = Math.max(320, scroll.clientWidth - 4); };
  const apply = () => { img.style.width = (baseW * z) + "px"; img.style.height = "auto"; };
  const start = () => { fit(); apply(); };
  if (img.complete) start();
  else img.addEventListener("load", start, { once: true });
  start();

  document.querySelectorAll(".map-zoom button").forEach((b) => {
    b.addEventListener("click", () => {
      const k = b.dataset.z;
      z = k === "in" ? Math.min(z * 1.4, 6) : k === "out" ? Math.max(z / 1.4, 1) : 1;
      apply();
    });
  });

  // 역 검색 → 상세
  $("mapStnBtn").addEventListener("click", openMapStation);
  $("mapStnInput").addEventListener("keydown", (e) => { if (e.key === "Enter") openMapStation(); });
  $("mapStnInput").addEventListener("change", openMapStation); // datalist 선택 시

  // 드래그로 팬(이동)
  let dragging = false, sx = 0, sy = 0, sl = 0, st = 0;
  scroll.addEventListener("mousedown", (e) => {
    dragging = true; sx = e.clientX; sy = e.clientY;
    sl = scroll.scrollLeft; st = scroll.scrollTop; scroll.classList.add("grabbing");
    e.preventDefault();
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    scroll.scrollLeft = sl - (e.clientX - sx);
    scroll.scrollTop = st - (e.clientY - sy);
  });
  window.addEventListener("mouseup", () => { dragging = false; scroll.classList.remove("grabbing"); });
}

// 노선도: 호선 선택 시 연결된 세로 노선도, 역명 검색 시 평면 목록
function renderStationHub(rows, lineSel) {
  if (lineSel) {
    const color = LINE_COLORS[lineSel] || "#687283";
    const sorted = rows.slice().sort((a, b) => (Number(a.FR_CODE) || 0) - (Number(b.FR_CODE) || 0));
    return `<div class="line-diagram" style="--lc:${color}">${
      sorted.map((r) => stationNodeHtml(r.STATION_NM, lineSel)).join("")}</div>`;
  }
  return `<div class="line-diagram flat">${
    rows.map((r) => stationNodeHtml(r.STATION_NM, normLine(r.LINE_NUM), normLine(r.LINE_NUM))).join("")}</div>`;
}

// 도착코드(arvlCd) → 선로 위 열차 위치(%)와 상태 텍스트
const ARVL_POS = { "99": 12, "4": 28, "5": 42, "3": 55, "0": 74, "1": 90, "2": 97 };
const ARVL_TXT = { "99": "운행 중", "4": "전역 진입", "5": "전역 도착", "3": "전역 출발", "0": "진입", "1": "도착", "2": "출발" };

// 선로 그래픽 — 열차가 목적역으로 다가가는 모습
function trackGraphic(color, pct, statusTxt, fromLabel, toLabel) {
  return `
    <div class="track" style="--lc:${color}">
      <div class="rail"></div>
      <div class="stop-dot from"></div>
      <div class="stop-dot to"></div>
      <div class="train" style="left:${Math.min(Math.max(pct, 4), 96)}%">
        <span class="train-ico">🚇</span>
        <span class="train-status">${esc(statusTxt)}</span>
      </div>
    </div>
    <div class="track-names">
      <span>${esc(fromLabel || "")}</span>
      <span class="track-dest">${esc(toLabel || "")}</span>
    </div>`;
}

function renderArrival(it) {
  const lineNm = SUBWAY_ID_NAME[String(it.subwayId)] || it.subwayNm || "";
  const color = LINE_COLORS[lineNm] || "#687283";
  const stn = esc(it.statnNm || "-");
  const dir = esc(it.trainLineNm || "");
  const msg = esc(it.arvlMsg2 || "");
  const cur = esc(it.arvlMsg3 || "");
  const updn = esc(it.updnLine || "");
  const express = String(it.btrainSttus || "").includes("급행") ? '<span class="chip chip-express">급행</span>' : "";
  const cd = String(it.arvlCd ?? "99");
  const pct = ARVL_POS[cd] ?? 12;
  const status = ARVL_TXT[cd] ?? "운행 중";
  return `
    <article class="card arr-card">
      <div class="card-top">
        <h3>${stn}</h3>
        ${lineBadge(lineNm)}
      </div>
      <p class="meta">${dir}${updn ? ` · ${updn}` : ""} ${express}</p>
      ${trackGraphic(color, pct, status, cur ? `현재: ${cur}` : "", stn)}
      <p class="arv">🚊 ${msg || "도착정보 없음"}</p>
    </article>`;
}

// 실시간 위치 — trainSttus: 0 진입 / 1 도착 / 2 출발
const POS_STTUS = { "0": { t: "진입", p: 74 }, "1": { t: "도착", p: 90 }, "2": { t: "출발", p: 97 } };
function renderPosition(it) {
  const lineNm = SUBWAY_ID_NAME[String(it.subwayId)] || it.subwayNm || "";
  const color = LINE_COLORS[lineNm] || "#687283";
  const stn = esc(it.statnNm || "-");
  const updn = { "0": "상행", "1": "하행" }[String(it.updnLine)] || esc(it.updnLine || "");
  const dest = esc(String(it.statnTnm || "").replace(/종착$/, ""));
  const st = POS_STTUS[String(it.trainSttus)] || { t: "운행 중", p: 50 };
  const express = String(it.directAt) === "1" ? '<span class="chip chip-express">급행</span>' : "";
  return `
    <article class="card arr-card">
      <div class="card-top">
        <h3>${stn}</h3>
        ${lineBadge(lineNm)}
      </div>
      <p class="meta">${it.trainNo ? `열차 ${esc(it.trainNo)} · ` : ""}${updn}${dest ? ` · ${dest}행` : ""} ${express}</p>
      ${trackGraphic(color, st.p, st.t, "", `${stn} ${st.t}`)}
    </article>`;
}
// "053400" → "05:34", "245300" → "24:53"
function fmtHrm(v) {
  const s = String(v || "").padStart(6, "0");
  return /^\d{6}$/.test(s) ? `${s.slice(0, 2)}:${s.slice(2, 4)}` : String(v || "-");
}

function renderFirstLast(it) {
  const line = esc(it.SBWY_ROUT_LN || "");
  const updn = { "1": "상행", "2": "하행" }[String(it.UPLN_DNLN)] || "";
  const dow  = { "1": "평일", "2": "토요일", "3": "일요일·공휴일" }[String(it.DOW)] || "";
  const fT = fmtHrm(it.FSTT_HRM);
  const lT = fmtHrm(it.LSTTM_HRM);
  const fRoute = [it.FSTT_DPTRE_STTN, it.FSTT_ARVL_STTN].filter(Boolean).map(esc).join("→");
  const lRoute = [it.LSTTM_DPTRE_STTN, it.LSTTM_ARVL_STTN].filter(Boolean).map(esc).join("→");
  return `
    <article class="card">
      <h3>${esc(it.STTN || "-")}</h3>
      <p class="meta">${[line, updn, dow].filter(Boolean).join(" · ")}</p>
      <p class="meta">🕐 첫차: <b>${fT}</b>${fRoute ? ` (${fRoute})` : ""}</p>
      <p class="meta">🌙 막차: <b>${lT}</b>${lRoute ? ` (${lRoute})` : ""}</p>
    </article>`;
}

function renderClosure(it) {
  const end = it.END_YMD && it.END_YMD !== "99991231" ? esc(it.END_YMD) : "미정";
  return `
    <article class="card">
      <div class="card-top">
        <h3>${esc(it.SBWY_STNS_NM || "-")}</h3>
        <span class="bed full">폐쇄 중</span>
      </div>
      <p class="meta">${esc(it.LINE || "")} · ${esc(it.CLSG_PLC || "")}</p>
      <p class="meta">📅 ${esc(it.BGNG_YMD || "")} ~ ${end}</p>
      ${it.CLSG_RSN ? `<p class="meta">사유: ${esc(it.CLSG_RSN)}</p>` : ""}
      ${it.RPLC_PATH ? `<p class="meta">대체경로: ${esc(it.RPLC_PATH)}</p>` : ""}
    </article>`;
}

// 실내공기질 미세먼지 수치·등급 (PM2.5 기준 좋음≤15·보통≤35·나쁨>35)
function airPm(it) { return Number(it.PMq || it.PM || 0); }
function airLevel(pm) {
  if (pm <= 15) return { level: "ok",   label: "좋음", rank: 0 };
  if (pm <= 35) return { level: "warn", label: "보통", rank: 1 };
  return { level: "full", label: "나쁨", rank: 2 };
}
// 공기질 결과 필터(좋음/보통/나쁨)·정렬(나쁜 순)
function sortAirRows(rows) {
  const f = $("airFilter") ? $("airFilter").value : "";
  let out = rows.slice();
  if (f) out = out.filter((it) => airLevel(airPm(it)).level === f);
  out.sort((a, b) => airPm(b) - airPm(a)); // PM 높은(나쁜) 순
  return out;
}

function renderAirQuality(it) {
  const pm = airPm(it);
  const { level, label } = airLevel(pm);
  return `
    <article class="card">
      <div class="card-top">
        <h3>${esc(it.AREA_NM || "-")}</h3>
        <span class="bed ${level}">미세먼지 ${pm}㎍/㎥ · ${label}</span>
      </div>
      <p class="meta">${it.LINE ? esc(/^\d+$/.test(it.LINE) ? `${it.LINE}호선` : it.LINE) + " · " : ""}측정: ${esc(it.CHECKDATE || "")}</p>
    </article>`;
}

function renderAccessibility(it) {
  const chips = [
    { k: "ELVT",             l: "엘리베이터" },
    { k: "ESCLT",            l: "에스컬레이터" },
    { k: "WHELCHR_LIFT",     l: "휠체어리프트" },
    { k: "HRZT_AUTO_NSCVRG", l: "수평자동보도" },
  ].map(({ k, l }) => {
    const n = Number(it[k] || 0);
    return `<span class="chip${n > 0 ? "" : " chip-no"}">${esc(l)} ${n}대</span>`;
  }).join("");
  return `
    <article class="card">
      <h3>${esc(it.SBWY_STNS_NM || "-")}</h3>
      <p class="meta">${esc(it.SBWY_ROUT_LN || "")}</p>
      <div class="chips">${chips}</div>
    </article>`;
}

function renderStats(it) {
  const on  = Number(it.GTON_TNOPE  || 0);
  const off = Number(it.GTOFF_TNOPE || 0);
  const ymd = String(it.USE_YMD || "");
  // USE_YMD 길이로 일별(8)·월 합계(6) 구분
  let period, periodLabel = "";
  if (ymd.length === 6) {
    period = `${ymd.slice(0, 4)}년 ${ymd.slice(4, 6)}월`;
    periodLabel = it.DAYS ? ` 합계 (${it.DAYS}일)` : " 합계";
  } else if (ymd.length === 8) {
    period = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  } else {
    period = ymd;
  }
  return `
    <article class="card">
      <h3>${esc(it.SBWY_STNS_NM || "-")}</h3>
      <p class="meta">${esc(it.SBWY_ROUT_LN_NM || "")} · ${esc(period)}${esc(periodLabel)}</p>
      <ul class="stats">
        <li><span>승차</span><b>${on.toLocaleString()}</b></li>
        <li><span>하차</span><b>${off.toLocaleString()}</b></li>
        <li><span>합계</span><b>${(on + off).toLocaleString()}</b></li>
      </ul>
    </article>`;
}

// "202605" → "2026년 05월"
function fmtYm(v) {
  const s = String(v || "");
  return /^\d{6}$/.test(s) ? `${s.slice(0, 4)}년 ${s.slice(4, 6)}월` : s;
}

function renderTimeStats(it) {
  const hrs = [];
  let totOn = 0, totOff = 0;
  for (let h = 4; h <= 24; h++) {
    const on  = Number(it[`HR_${h}_GET_ON_NOPE`]  || 0);
    const off = Number(it[`HR_${h}_GET_OFF_NOPE`] || 0);
    totOn += on; totOff += off;
    if (on || off) hrs.push(`${h}시: 승차 ${on.toLocaleString()} / 하차 ${off.toLocaleString()}`);
  }
  const header = `
      <h3>${esc(it.STTN || "-")}</h3>
      <p class="meta">${esc(it.SBWY_ROUT_LN_NM || "")} · ${esc(fmtYm(it.USE_MM))}</p>`;

  // 연월(YYYYMM) 입력 → 월 전체 합계만
  if (!timeStatsDetail) {
    return `
    <article class="card">${header}
      <ul class="stats">
        <li><span>승차</span><b>${totOn.toLocaleString()}</b></li>
        <li><span>하차</span><b>${totOff.toLocaleString()}</b></li>
        <li><span>합계</span><b>${(totOn + totOff).toLocaleString()}</b></li>
      </ul>
    </article>`;
  }

  // 날짜(YYYYMMDD) 입력 → 시간대 개별 항목
  return `
    <article class="card">${header}
      <ul class="time-stats">${hrs.length ? hrs.map((r) => `<li class="meta">${esc(r)}</li>`).join("") : "<li class='meta'>시간대별 데이터 없음</li>"}</ul>
      <p class="meta">합계 · 승차 ${totOn.toLocaleString()} / 하차 ${totOff.toLocaleString()}</p>
    </article>`;
}

// "POINT(126.901 37.533)" → { lon, lat }
function parseWkt(wkt) {
  const m = String(wkt || "").match(/POINT\s*\(\s*([\d.]+)\s+([\d.]+)\s*\)/);
  return m ? { lon: m[1], lat: m[2] } : null;
}
// 좌표 표시 + 카카오맵 링크 (시설은 위치 설명 필드가 없어 좌표로 구분)
function geoBlock(it, label) {
  const c = parseWkt(it.NODE_WKT);
  if (!c) return "";
  const name = encodeURIComponent(`${it.SBWY_STN_NM || ""} ${label}`.trim());
  const url = `https://map.kakao.com/link/map/${name},${c.lat},${c.lon}`;
  return `
      <p class="meta">📍 ${Number(c.lat).toFixed(5)}, ${Number(c.lon).toFixed(5)}</p>
      <div class="card-actions"><a class="btn map" href="${url}" target="_blank" rel="noopener">🗺️ 지도에서 보기</a></div>`;
}

// 시설 종류 배지 (엘리베이터=파랑, 리프트=주황)
function facBadge(type) {
  if (!type) return "";
  const c = type === "리프트" ? "#CD7C2F" : "#00A5DE";
  return `<span class="line-badge" style="background:${c}">${esc(type)}</span>`;
}
function renderNodePos(it, i = 0) {
  // 동일 역에 시설이 여러 개라 ①②③ 번호로 구분, 종류 배지·좌표·지도 링크 제공
  const seq = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩"][i] || `#${i + 1}`;
  return `
    <article class="card">
      <div class="card-top">
        <h3>${esc(it.SBWY_STN_NM || it.NODE_ID || "-")} <span class="seq">${seq}</span></h3>
        ${facBadge(it.FAC_TYPE)}
      </div>
      <p class="meta">${[esc(it.SGG_NM || ""), esc(it.EMD_NM || "")].filter(Boolean).join(" · ")}</p>
      ${it.SBWY_STN_CD ? `<p class="meta">역코드: ${esc(it.SBWY_STN_CD)} · 시설ID: ${esc(it.NODE_ID || "-")}</p>` : ""}
      ${geoBlock(it, esc(it.FAC_TYPE || ""))}
    </article>`;
}

function renderAreaStats(it) {
  const total = Number(it.SBWY_PSNG || 0);
  // 시간대별 최다 승차 시간 찾기
  let peakH = -1, peakV = 0;
  for (let h = 0; h <= 23; h++) {
    const v = Number(it[`SBWY_PSNG_${String(h).padStart(2, "0")}`] || 0);
    if (v > peakV) { peakV = v; peakH = h; }
  }
  return `
    <article class="card">
      <h3>행정동 ${esc(it.DONG_ID || "-")}</h3>
      <p class="meta">기준일: ${esc(it.CRTR_DD || "")}</p>
      <p class="meta">총 승차: <b>${total.toLocaleString()}</b>명</p>
      ${peakH >= 0 ? `<p class="meta">최다 시간대: ${peakH}시 (${peakV.toLocaleString()}명)</p>` : ""}
    </article>`;
}

// getShtrmPath body — { totalDstc(m), totalReqHr(초), totalCardCrg(원), trsitNmtm(환승), paths[] }
function renderPath(body) {
  const mins = Math.round(Number(body.totalReqHr || 0) / 60);
  const dist = body.totalDstc ? `${(Number(body.totalDstc) / 1000).toFixed(1)}km` : "";
  const fare = body.totalCardCrg ? `${Number(body.totalCardCrg).toLocaleString()}원` : "";
  const tran = `환승 ${Number(body.trsitNmtm || 0)}회`;
  const paths = Array.isArray(body.paths) ? body.paths : [];
  const dep = paths[0]?.dptreStn?.stnNm || "";
  const arr = paths[paths.length - 1]?.arvlStn?.stnNm || "";
  const segs = paths.map((p) => {
    const t = [p.trainDptreTm, p.trainArvlTm].filter(Boolean).map((v) => String(v).slice(0, 5)).join("~");
    return `${esc(p.dptreStn?.lineNm || "")} ${esc(p.dptreStn?.stnNm || "")} → ${esc(p.arvlStn?.stnNm || "")}${t ? ` (${t})` : ""}`;
  });
  return `
    <article class="card">
      <h3>${dep && arr ? `${esc(dep)} → ${esc(arr)}` : "경로 정보"}</h3>
      <ul class="stats">
        <li><span>소요시간</span><b>${mins}분</b></li>
        <li><span>거리</span><b>${dist || "-"}</b></li>
        <li><span>요금</span><b>${fare || "-"}</b></li>
      </ul>
      <p class="meta">${esc(tran)}</p>
      <ul class="time-stats">${segs.map((s) => `<li class="meta">${s}</li>`).join("")}</ul>
    </article>`;
}

function renderFacilitySub(it) {
  const ok = String(it.USE_YN || "").includes("사용") && !String(it.USE_YN || "").includes("불");
  return `
    <article class="card">
      <div class="card-top">
        <h3>${esc(it.STN_NM || "-")}</h3>
        ${it.USE_YN ? `<span class="bed ${ok ? "ok" : "full"}">${esc(it.USE_YN)}</span>` : ""}
      </div>
      <p class="addr">${esc(it.ELVTR_NM || "")}</p>
      <p class="meta">${[esc(it.INSTL_PSTN || ""), esc(it.OPR_SEC || "")].filter(Boolean).join(" · ")}</p>
    </article>`;
}

// ---------- 공용 상세 모달 ----------
function openModal(html) {
  $("modalBody").innerHTML = html;
  $("modal").style.display = "";
  document.body.style.overflow = "hidden";
}

// 역 정보 모달 — 한 역의 도착·첫차막차·편의시설·공기질을 병렬 조회해 종합
async function openStationDetail(station, line) {
  if (!station) return;
  // 이 역이 지나는 모든 호선 (노선도 데이터에서 조회) → 호선 버튼용
  const allLines = ((_mapData && _mapData.stations) || []).find((s) => s.nm === station)?.lines
    || (line ? [line] : []);
  if (!line && allLines.length) line = allLines[0];
  openModal(`<p class="modal-loading">${esc(station)} 정보를 불러오는 중…</p>`);
  const q = encodeURIComponent(station);
  const L = encodeURIComponent(line || "");
  const get = (u) => fetch(u).then((r) => r.json()).catch(() => ({ rows: [] }));
  // 직전 달(YYYYMM) — 승하차 통계용
  const d = new Date(); d.setMonth(d.getMonth() - 1);
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  try {
    const [arr, pos, acc, elevLift, air, flUp, flDn, stats, closure] = await Promise.all([
      get(`/api/subway?kind=arrival&q=${q}`),
      // 열차 위치: 호선 지정 시 그 호선만, 미지정 시 1~9 전체에서 이 역 통과 열차만 필터
      line ? get(`/api/subway?kind=position&line=${L}`) : get(`/api/subway?kind=position`),
      get(`/api/subway?kind=accessibility&q=${q}${line ? `&line=${L}` : ""}`),
      get(`/api/subway?kind=elevatorLift&q=${q}`),
      get(`/api/subway?kind=airquality&q=${q}${line ? `&line=${L}` : ""}`),
      line ? get(`/api/subway?kind=firstlast&q=${q}&line=${L}&updn=상행`) : Promise.resolve({ rows: [] }),
      line ? get(`/api/subway?kind=firstlast&q=${q}&line=${L}&updn=하행`) : Promise.resolve({ rows: [] }),
      get(`/api/subway?kind=stats&ym=${ym}&station=${q}`),
      get(`/api/subway?kind=closure&q=${q}`),
    ]);
    // 열차 위치 — 이 역을 통과/도착/출발하는 열차만
    const posRows = (pos.rows || []).filter((r) => String(r.statnNm || "").includes(station));
    const fl = { rows: [...(flUp.rows || []), ...(flDn.rows || [])] };
    $("modalBody").innerHTML = renderStationModal(station, line, { arr, pos: { rows: posRows }, acc, elevLift, air, fl, stats, closure, ym, allLines });
    // 최단경로 도착역 자동완성 — 노선도 데이터의 전체 역명
    const dl = $("modalPathList");
    if (dl && _mapData && _mapData.stations) {
      dl.innerHTML = _mapData.stations.map((s) => `<option value="${esc(s.nm)}"></option>`).join("");
    }
  } catch (e) {
    $("modalBody").innerHTML = `<p class="status error">오류: ${esc(e.message)}</p>`;
  }
}

function renderStationModal(station, line, { arr, pos, acc, elevLift, air, fl, stats, closure, ym, allLines }) {
  // 실시간 도착
  const arrRows = (arr.rows || []).slice(0, 6);
  const arrHtml = arrRows.length
    ? arrRows.map((it) => {
        const ln = SUBWAY_ID_NAME[String(it.subwayId)] || it.subwayNm || "";
        return `<li class="meta">${lineBadge(ln)} ${esc(it.trainLineNm || "")} — <b>${esc(it.arvlMsg2 || "")}</b></li>`;
      }).join("")
    : "<li class='meta'>실시간 도착 정보 없음</li>";
  // 열차 위치 — 이 역을 통과/도착/출발하는 운행 중인 열차
  const posRows = (pos && pos.rows) || [];
  const posHtml = posRows.length
    ? posRows.slice(0, 6).map((it) => {
        const ln = SUBWAY_ID_NAME[String(it.subwayId)] || it.subwayNm || "";
        const updn = { "0": "상행", "1": "하행" }[String(it.updnLine)] || "";
        const st = POS_STTUS[String(it.trainSttus)] || { t: "운행 중" };
        const dest = String(it.statnTnm || "").replace(/종착$/, "");
        return `<li class="meta">${lineBadge(ln)} ${esc(updn)}${dest ? ` · ${esc(dest)}행` : ""} — <b>${esc(st.t)}</b></li>`;
      }).join("")
    : "<li class='meta'>현재 통과 중인 열차 없음 <span class='opt'>(위치 정보는 1~9호선만 제공)</span></li>";
  // 첫차/막차
  const flRows = fl.rows || [];
  const flHtml = flRows.length
    ? flRows.slice(0, 4).map((it) => {
        const dir = { "1": "상행", "2": "하행" }[String(it.UPLN_DNLN)] || "";
        return `<li class="meta">${esc(dir)} · 첫차 <b>${fmtHrm(it.FSTT_HRM)}</b> / 막차 <b>${fmtHrm(it.LSTTM_HRM)}</b></li>`;
      }).join("")
    : "<li class='meta'>첫차/막차 정보 없음</li>";
  // 편의시설 대수
  const a = (acc.rows || [])[0];
  const accChips = a
    ? [["ELVT", "엘리베이터"], ["ESCLT", "에스컬레이터"], ["WHELCHR_LIFT", "휠체어리프트"], ["HRZT_AUTO_NSCVRG", "수평자동보도"]]
        .map(([k, l]) => { const n = Number(a[k] || 0); return `<span class="chip${n > 0 ? "" : " chip-no"}">${l} ${n}대</span>`; }).join("")
    : "<span class='meta'>편의시설 정보 없음</span>";
  const elCount = (elevLift.rows || []).length;
  // 승하차 통계 (직전 달, 호선별 합산)
  const stRows = (stats && stats.rows) || [];
  const statHtml = stRows.length
    ? stRows.slice(0, 4).map((it) => {
        const on = Number(it.GTON_TNOPE || 0), off = Number(it.GTOFF_TNOPE || 0);
        return `<li class="meta">${esc(it.SBWY_ROUT_LN_NM || "")} · 승차 <b>${on.toLocaleString()}</b> / 하차 <b>${off.toLocaleString()}</b></li>`;
      }).join("")
    : "<li class='meta'>승하차 통계 없음</li>";
  // 출입구 폐쇄 (있을 때만)
  const clRows = (closure && closure.rows) || [];
  const clHtml = clRows.length
    ? `<div class="st-sec"><h4>🚧 출입구 폐쇄</h4><ul class="time-stats">${
        clRows.slice(0, 5).map((it) => `<li class="meta">${esc(it.CLSG_PLC || it.SBWY_STNS_NM || "")} — ${esc(it.CLSG_RSN || "공사")}</li>`).join("")}</ul></div>`
    : "";
  // 실내공기질
  const air0 = (air.rows || [])[0];
  const airHtml = air0
    ? (() => { const pm = airPm(air0); const { level, label } = airLevel(pm); return `<span class="bed ${level}">미세먼지 ${pm}㎍/㎥ · ${label}</span> <span class="meta">측정 ${esc(air0.CHECKDATE || "")}</span>`; })()
    : "<span class='meta'>실내공기질 측정 정보 없음</span>";

  // 호선 버튼 — 여러 호선이 지나면 버튼으로, 누르면 그 호선 정보로 전환
  const lines = (allLines && allLines.length) ? allLines : (line ? [line] : []);
  const lineBtns = lines.length > 1
    ? `<div class="modal-lines">${lines.map((ln) =>
        `<button class="line-btn${ln === line ? " active" : ""}" data-station="${esc(station)}" data-line="${esc(ln)}" style="--lc:${lineColor(ln)}">${esc(ln)}</button>`).join("")}</div>`
    : (line ? lineBadge(line) : "");

  return `
    <div class="st-modal">
      <div class="card-top">
        <h2 class="d-title">🚉 ${esc(station)}</h2>
        ${lines.length > 1 ? "" : lineBtns}
      </div>
      ${lines.length > 1 ? lineBtns : ""}
      <div class="st-sec">
        <h4>🚊 실시간 정보 <span class="opt">(도착·위치)</span></h4>
        <p class="rt-label">🚊 도착 임박 열차</p>
        <ul class="time-stats">${arrHtml}</ul>
        <p class="rt-label">🚄 운행 중 열차 위치</p>
        <ul class="time-stats">${posHtml}</ul>
      </div>
      ${line ? `<div class="st-sec"><h4>⏰ 첫차 / 막차 <span class="opt">(평일)</span></h4><ul class="time-stats">${flHtml}</ul></div>` : ""}
      <div class="st-sec">
        <h4>🗺️ 최단경로 <span class="opt">(${esc(station)} 출발)</span></h4>
        <div class="path-form">
          <input id="modalPathArr" type="text" list="modalPathList" placeholder="도착역을 입력하세요 (예: 홍대입구)" />
          <datalist id="modalPathList"></datalist>
          <button class="search-btn path-go" data-dep="${esc(station)}">경로 찾기</button>
        </div>
        <div id="modalPathResult" class="path-result"></div>
      </div>
      <div class="st-sec">
        <h4>♿ 편의시설</h4>
        <div class="chips">${accChips}</div>
        ${elCount ? `<p class="meta">🛗 엘리베이터·리프트 위치 ${elCount}곳</p>` : ""}
      </div>
      <div class="st-sec">
        <h4>📊 승하차 통계 <span class="opt">(${esc(fmtYm(ym))})</span></h4>
        <ul class="time-stats">${statHtml}</ul>
      </div>
      ${clHtml}
      <div class="st-sec">
        <h4>🌬️ 실내공기질</h4>
        ${airHtml}
      </div>
    </div>`;
}

// 모달 안에서 최단경로 조회 (출발=현재 역)
async function runModalPath(dep) {
  const arr = $("modalPathArr").value.trim();
  const out = $("modalPathResult");
  if (!arr) { out.innerHTML = `<p class="meta">도착역을 입력하세요.</p>`; return; }
  if (arr === dep) { out.innerHTML = `<p class="meta">출발역과 도착역이 같습니다.</p>`; return; }
  out.innerHTML = `<p class="modal-loading">경로 조회 중…</p>`;
  try {
    const r = await fetch(`/api/subway?kind=shortestPath&dep=${encodeURIComponent(dep)}&arr=${encodeURIComponent(arr)}`);
    const j = await r.json();
    if (!r.ok || !(j.rows || []).length) throw new Error(j.message || j.error || "경로를 찾을 수 없습니다.");
    out.innerHTML = renderPath(j.rows[0]);
  } catch (e) {
    out.innerHTML = `<p class="status warn">${esc(e.message)}</p>`;
  }
}
function closeModal() {
  $("modal").style.display = "none";
  document.body.style.overflow = "";
  $("modalBody").innerHTML = "";
}
// ---------- 이벤트 ----------
$("subBtn").addEventListener("click", searchSubway);
$("airFilter").addEventListener("change", () => { if (currentMode.id === "airquality") searchSubway(); });
$("subQ").addEventListener("keydown", (e) => { if (e.key === "Enter") searchSubway(); });

// 역 노드(동적 생성) — 이벤트 위임
$("results").addEventListener("click", (e) => {
  const s = e.target.closest(".station-node, .map-stn");
  if (s) openStationDetail(s.dataset.station, s.dataset.line);
});
// 역 상세 모달의 호선 버튼 / 최단경로 조회 — 이벤트 위임
$("modalBody").addEventListener("click", (e) => {
  const b = e.target.closest(".line-btn");
  if (b) { openStationDetail(b.dataset.station, b.dataset.line); return; }
  const p = e.target.closest(".path-go");
  if (p) runModalPath(p.dataset.dep);
});
$("modalBody").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.id === "modalPathArr") {
    const btn = $("modalBody").querySelector(".path-go");
    if (btn) runModalPath(btn.dataset.dep);
  }
});
$("modalClose").addEventListener("click", closeModal);
$("modalBackdrop").addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("modal").style.display !== "none") closeModal();
});

initSubLine();
setTab("subway");
