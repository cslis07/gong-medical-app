// ===== 공공의료 정보 찾기 — 프론트엔드 로직 (모드 확장판) =====
// 탭(서비스) → 모드(오퍼레이션) 구조.
// input: "region"(시도/시군구/기관명) | "geo"(GPS 위/경도)

const TABS = {
  emergency: {
    service: "emergency",
    modes: [
      {
        id: "realtime", label: "실시간 가용병상", input: "region",
        op: "getEmrrmRltmUsefulSckbdInfoInqire", sigunguRequired: true, keyword: false,
        params: (s, g) => ({ STAGE1: s, STAGE2: g }),
        render: renderEmergency,
        hint: "※ 실시간 가용병상은 시/군/구까지 선택해야 조회됩니다.",
      },
      {
        id: "nearby", label: "📍 내 주변", input: "geo",
        op: "getEgytLcinfoInqire",
        params: (lon, lat) => ({ WGS84_LON: lon, WGS84_LAT: lat }),
        render: renderNearby,
      },
      {
        id: "trauma", label: "🚨 외상센터", input: "region",
        op: "getStrmListInfoInqire", sigunguRequired: false, keyword: false,
        params: (s, g) => ({ Q0: s, Q1: g, ORD: "NAME" }),
        render: renderTrauma,
      },
      {
        id: "severe", label: "🆘 중증질환 수용", input: "region",
        op: "getSrsillDissAceptncPosblInfoInqire", sigunguRequired: true, keyword: false,
        params: (s, g) => {
          const t = $("severeType").value;
          return { STAGE1: s, STAGE2: g, ...(t ? { SM_TYPE: t } : {}) };
        },
        render: renderSevere,
        hint: "🆘 시/군/구까지 선택하세요. 특정 중증질환 수용 병원만 보려면 질환을 선택하세요.",
      },
    ],
  },
  hospital: {
    service: "hospital",
    modes: [
      {
        id: "all", label: "병·의원", input: "region",
        op: "getHsptlMdcncListInfoInqire", sigunguRequired: false, keyword: true,
        params: (s, g, kw) => ({ Q0: s, Q1: g, QN: kw, ORD: "NAME" }),
        render: renderFacility,
      },
      {
        id: "baby", label: "🌙 달빛어린이병원", input: "region",
        op: "getBabyListInfoInqire", sigunguRequired: false, keyword: false,
        params: (s, g) => ({ Q0: s, Q1: g }),
        render: renderFacility,
        hint: "🌙 달빛어린이병원은 야간·휴일 소아 진료 기관입니다.",
      },
    ],
  },
  pharmacy: {
    service: "pharmacy",
    modes: [
      {
        id: "region", label: "지역 검색", input: "region",
        op: "getParmacyListInfoInqire", sigunguRequired: false, keyword: true,
        params: (s, g, kw) => ({ Q0: s, Q1: g, QN: kw, ORD: "NAME" }),
        render: renderFacility,
      },
      {
        id: "nearby", label: "📍 내 주변", input: "geo",
        op: "getParmacyLcinfoInqire",
        params: (lon, lat) => ({ WGS84_LON: lon, WGS84_LAT: lat }),
        render: renderNearby,
      },
    ],
  },
  // 서울 열린데이터광장 — 서울시 공공서비스예약 (카테고리별 모드, input="seoul")
  seoul: {
    service: "seoul",
    modes: [
      { id: "all", label: "전체", input: "seoul", cat: "all" },
      { id: "culture", label: "🎭 문화행사", input: "seoul", cat: "culture" },
      { id: "education", label: "📚 교육", input: "seoul", cat: "education" },
      { id: "medical", label: "🩺 진료", input: "seoul", cat: "medical" },
      { id: "sport", label: "⚽ 체육시설", input: "seoul", cat: "sport" },
      { id: "institution", label: "🏛️ 시설대관", input: "seoul", cat: "institution" },
    ],
  },
  // 서울 지하철 (실시간 + 역정보/편의시설)
  subway: {
    service: "subway",
    modes: [
      { id: "arrival", label: "🔴 실시간 도착", input: "subway", sub: "q", kind: "arrival", render: renderArrival,
        hint: "🔴 역명을 입력하면 해당 역의 실시간 도착 열차를 보여줍니다. (실시간 권한 키 필요)" },
      { id: "position", label: "🚄 실시간 위치", input: "subway", sub: "line", kind: "position", render: renderPosition,
        hint: "🚄 호선을 선택하면 운행 중 열차의 현재 위치를 보여줍니다." },
      { id: "stationInfo", label: "🚉 역 정보", input: "subway", sub: "q", kind: "stationInfo", render: renderStationInfo,
        hint: "🚉 역명을 입력하면 호선·역코드 정보를 보여줍니다." },
      { id: "facility", label: "♿ 편의시설", input: "subway", sub: "q", kind: "facility", render: renderFacilitySub,
        hint: "♿ 역명을 입력하면 엘리베이터·에스컬레이터 위치와 사용여부를 보여줍니다." },
    ],
  },
};

let currentTab = "emergency";
let currentMode = TABS.emergency.modes[0];

const $ = (id) => document.getElementById(id);
const sidoSel = $("sido");
const sigunguSel = $("sigungu");

// ---------- 초기화 ----------
function initRegions() {
  sidoSel.innerHTML = '<option value="">선택</option>' +
    Object.keys(REGIONS).map((s) => `<option value="${s}">${s}</option>`).join("");
  sidoSel.addEventListener("change", fillSigungu);
}
function fillSigungu() {
  const list = REGIONS[sidoSel.value] || [];
  sigunguSel.innerHTML = '<option value="">전체</option>' +
    list.map((g) => `<option value="${g}">${g}</option>`).join("");
}
function initSeoulArea() {
  const gus = REGIONS["서울특별시"] || [];
  $("seoulArea").innerHTML = '<option value="">전체</option>' +
    gus.map((g) => `<option value="${g}">${g}</option>`).join("");
}

// 중증질환 코드(mkioskty1~28) → 질환명
const SEVERE_TYPES = {
  1: "[재관류중재술] 심근경색", 2: "[재관류중재술] 뇌경색",
  3: "[뇌출혈수술] 거미막하출혈", 4: "[뇌출혈수술] 거미막하출혈 외",
  5: "[대동맥응급] 흉부", 6: "[대동맥응급] 복부",
  7: "[담낭담관질환] 담낭질환", 8: "[담낭담관질환] 담도포함질환",
  9: "[복부응급수술] 비외상", 10: "[장중첩/폐색] 영유아",
  11: "[응급내시경] 성인 위장관", 12: "[응급내시경] 영유아 위장관",
  13: "[응급내시경] 성인 기관지", 14: "[응급내시경] 영유아 기관지",
  15: "[저체중출생아] 집중치료", 16: "[산부인과응급] 분만",
  17: "[산부인과응급] 산과수술", 18: "[산부인과응급] 부인과수술",
  19: "[중증화상] 전문치료", 20: "[사지접합] 수족지접합",
  21: "[사지접합] 수족지접합 외", 22: "[응급투석] HD",
  23: "[응급투석] CRRT", 24: "[정신과적응급] 폐쇄병동입원",
  25: "[안과적수술] 응급", 26: "[영상의학혈관중재] 성인",
  27: "[영상의학혈관중재] 영유아", 28: "응급실(Emergency gate keeper)",
};
function initSevere() {
  $("severeType").innerHTML = '<option value="">전체</option>' +
    Object.entries(SEVERE_TYPES).map(([n, l]) => `<option value="${n}">${l}</option>`).join("");
}

// 지하철 호선 (실시간 위치용)
const SUBWAY_LINES = ["1호선","2호선","3호선","4호선","5호선","6호선","7호선","8호선","9호선","경의중앙선","수인분당선","신분당선","공항철도","경춘선","우이신설선","서해선","김포골드라인"];
function initSubLine() {
  $("subLine").innerHTML = SUBWAY_LINES.map((l) => `<option value="${l}">${l}</option>`).join("");
}

async function searchSubway() {
  const m = currentMode;
  const qs = new URLSearchParams({ kind: m.kind });
  if (m.sub === "line") {
    qs.set("line", $("subLine").value);
  } else {
    const q = $("subQ").value.trim();
    if (!q) return setStatus("역명을 입력하세요.", "warn");
    qs.set("q", q);
  }
  setStatus("조회 중…", "loading");
  $("results").innerHTML = "";
  try {
    const r = await fetch(`/api/subway?${qs.toString()}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    if (data.code && !["INFO-000", ""].includes(data.code))
      throw new Error(`API [${data.code}] ${data.message || ""}`);
    const rows = data.rows || [];
    if (!rows.length) return setStatus("조회 결과가 없습니다.", "warn");
    setStatus(`${rows.length}건 표시`, "ok");
    $("results").innerHTML = rows.map(m.render).join("");
  } catch (e) {
    setStatus(`오류: ${e.message}`, "error");
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
  bar.innerHTML = modes.map((m) =>
    `<button class="mode" data-mode="${m.id}">${m.label}</button>`).join("");
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

  const t = mode.input; // region | geo | seoul | subway
  toggleGroup("region-only", t === "region");
  toggleGroup("geo-only", t === "geo");
  toggleGroup("seoul-only", t === "seoul");
  toggleGroup("subway-only", t === "subway");
  toggleGroup("severe-only", mode.id === "severe");
  if (t === "region") $("keyword-field").style.display = mode.keyword ? "" : "none";
  if (t === "subway") {
    const isLine = mode.sub === "line";
    toggleGroup("sub-line", isLine);
    toggleGroup("sub-q", !isLine);
  }

  $("hint").textContent = mode.hint || (
    t === "geo" ? "📍 브라우저 위치 권한이 필요합니다. 가까운 순으로 정렬됩니다." :
    t === "seoul" ? "🎫 서울시 공공서비스예약 — 자치구·접수상태로 좁혀보세요. (상위 1000건 내 검색)" : "");
  $("results").innerHTML = "";
  $("status").textContent = "";
}

// ---------- 조회 (지역) ----------
async function searchRegion() {
  const m = currentMode;
  const sido = sidoSel.value, sigungu = sigunguSel.value, kw = $("keyword").value.trim();
  if (!sido) return setStatus("시/도를 선택하세요.", "warn");
  if (m.sigunguRequired && !sigungu)
    return setStatus("이 조회는 시/군/구를 선택해야 합니다.", "warn");
  await runQuery(m.params(sido, sigungu, kw));
}

// ---------- 조회 (내 위치) ----------
function searchGeo() {
  if (!navigator.geolocation) return setStatus("이 브라우저는 위치 기능을 지원하지 않습니다.", "error");
  setStatus("위치 확인 중…", "loading");
  navigator.geolocation.getCurrentPosition(
    (pos) => runQuery(currentMode.params(pos.coords.longitude, pos.coords.latitude), true),
    (err) => setStatus(`위치 가져오기 실패: ${err.message}`, "error"),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

async function runQuery(params, sortByDistance = false) {
  setStatus("조회 중…", "loading");
  $("results").innerHTML = "";
  const qs = new URLSearchParams({ service: currentTab, op: currentMode.op, numOfRows: "50" });
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  try {
    const r = await fetch(`/api/proxy?${qs.toString()}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    if (data.resultCode && data.resultCode !== "00")
      throw new Error(`API 오류 [${data.resultCode}] ${data.resultMsg}`);
    let items = data.items;
    if (!items.length) return setStatus("조회 결과가 없습니다.", "warn");
    if (sortByDistance) items = [...items].sort((a, b) => num(a.distance) - num(b.distance));
    setStatus(`총 ${data.totalCount}건 중 ${items.length}건 표시`, "ok");
    $("results").innerHTML = items.map(currentMode.render).join("");
  } catch (e) {
    setStatus(`오류: ${e.message}`, "error");
  }
}

function setStatus(msg, type = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = "status " + type;
}

// ---------- 서울 공공서비스예약 ----------
async function searchSeoul() {
  const cat = currentMode.cat;
  setStatus("조회 중…", "loading");
  $("results").innerHTML = "";
  try {
    const r = await fetch(`/api/seoul?cat=${cat}&start=1&end=1000`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    if (data.code && data.code !== "INFO-000") throw new Error(`API [${data.code}] ${data.message}`);
    let rows = data.rows || [];
    const area = $("seoulArea").value, stat = $("seoulStat").value, kw = $("seoulKw").value.trim();
    if (area) rows = rows.filter((x) => x.AREANM === area);
    if (stat) rows = rows.filter((x) => (x.SVCSTATNM || "") === stat);
    if (kw) rows = rows.filter((x) => dec(x.SVCNM || "").includes(kw));
    if (!rows.length) return setStatus("조회 결과가 없습니다. (필터를 완화해 보세요)", "warn");
    setStatus(`전체 ${data.total}건 · 조건 일치 ${rows.length}건 표시`, "ok");
    $("results").innerHTML = rows.slice(0, 100).map(renderSeoul).join("");
  } catch (e) {
    setStatus(`오류: ${e.message}`, "error");
  }
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
const telLink = (t) => (t ? `<a class="btn tel" href="tel:${esc(t).replace(/[^0-9]/g, "")}">📞 ${esc(t)}</a>` : "");
function mapLink(name, lat, lon) {
  if (!lat || !lon) return "";
  return `<a class="btn map" href="https://map.kakao.com/link/map/${encodeURIComponent(name)},${lat},${lon}" target="_blank" rel="noopener">🗺️ 지도</a>`;
}

// ---------- 렌더러 ----------
function renderFacility(it) {
  return `
    <article class="card">
      <h3>${esc(it.dutyName)}</h3>
      <p class="addr">📍 ${esc(it.dutyAddr)}</p>
      <p class="hours">🕒 ${esc(todayHours(it))}</p>
      <div class="card-actions">
        ${telLink(it.dutyTel1)}
        ${mapLink(it.dutyName, it.wgs84Lat, it.wgs84Lon)}
      </div>
    </article>`;
}

function renderNearby(it) {
  const d = num(it.distance);
  const open = it.startTime && it.endTime ? `오늘 ${fmt(it.startTime)} ~ ${fmt(it.endTime)}` : "";
  return `
    <article class="card">
      <div class="card-top">
        <h3>${esc(it.dutyName)}</h3>
        ${Number.isNaN(d) ? "" : `<span class="bed ok">${d.toFixed(2)}km</span>`}
      </div>
      <p class="addr">📍 ${esc(it.dutyAddr)}</p>
      <p class="meta">${esc(it.dutyDivName || "")}${open ? " · " + open : ""}</p>
      <div class="card-actions">
        ${telLink(it.dutyTel1)}
        ${mapLink(it.dutyName, it.latitude, it.longitude)}
      </div>
    </article>`;
}

function renderTrauma(it) {
  return `
    <article class="card">
      <div class="card-top">
        <h3>${esc(it.dutyName)}</h3>
        ${it.dutyEmclsName ? `<span class="bed ok">${esc(it.dutyEmclsName)}</span>` : ""}
      </div>
      <p class="addr">📍 ${esc(it.dutyAddr)}</p>
      <div class="card-actions">
        ${telLink(it.dutyTel1)}
        ${it.dutyTel3 ? `<a class="btn tel" href="tel:${esc(it.dutyTel3).replace(/[^0-9]/g, "")}">🚑 응급실 ${esc(it.dutyTel3)}</a>` : ""}
        ${mapLink(it.dutyName, it.wgs84Lat, it.wgs84Lon)}
      </div>
    </article>`;
}

// ---------- 지하철 렌더러 ----------
function renderArrival(it) {
  const dir = esc(it.trainLineNm || "");
  const line = esc(it.subwayNm || "");
  const msg = esc(it.arvlMsg2 || "");
  const pos = esc(it.arvlMsg3 || "");
  const updn = esc(it.updnLine || "");
  return `
    <article class="card">
      <h3>${dir || line}</h3>
      <p class="meta">${line}${updn ? ` · ${updn}` : ""}</p>
      <p class="arv">🚊 ${msg || "도착정보 없음"}</p>
      ${pos ? `<p class="meta">현재 위치: ${pos}</p>` : ""}
    </article>`;
}
function renderPosition(it) {
  return `
    <article class="card">
      <h3>${esc(it.statnNm || "-")}</h3>
      <p class="meta">${esc(it.subwayNm || "")}${it.trainNo ? ` · 열차 ${esc(it.trainNo)}` : ""}${it.updnLine ? ` · 방향 ${esc(it.updnLine)}` : ""}</p>
    </article>`;
}
function renderStationInfo(it) {
  const parts = [it.LINE_NUM, it.FR_CODE ? `외부코드 ${it.FR_CODE}` : "", it.STATION_CD ? `역코드 ${it.STATION_CD}` : ""].filter(Boolean).map(esc);
  return `
    <article class="card">
      <h3>${esc(it.STATION_NM || "-")}</h3>
      <p class="meta">${parts.join(" · ")}</p>
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

const isYes = (v) => { const s = String(v ?? "").trim(); return s === "Y" || s === "가능"; };
function renderSevere(it) {
  const name = esc(it.dutyName || it.hpid || "-");
  const chips = [];
  for (let n = 1; n <= 28; n++) {
    const v = it["MKioskTy" + n] ?? it["mkioskty" + n];
    if (isYes(v)) chips.push(SEVERE_TYPES[n]);
  }
  const body = chips.length
    ? `<div class="chips">${chips.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>`
    : `<p class="meta">현재 수용 가능 항목 없음 또는 정보 미제공</p>`;
  return `
    <article class="card">
      <div class="card-top">
        <h3>${name}</h3>
        <span class="bed ${chips.length ? "ok" : "full"}">수용 ${chips.length}</span>
      </div>
      ${body}
    </article>`;
}

function renderSeoul(it) {
  const stat = it.SVCSTATNM || "";
  const statCls = stat === "접수중" ? "ok" : "full";
  const url = dec(it.SVCURL || "");
  const rcpt = (it.RCPTBGNDT || it.RCPTENDDT) ? `${fmtDT(it.RCPTBGNDT)} ~ ${fmtDT(it.RCPTENDDT)}` : "";
  const meta2 = [dec(it.MINCLASSNM || ""), it.PAYATNM, dec(it.USETGTINFO || "")].filter(Boolean).map(esc).join(" · ");
  return `
    <article class="card">
      <div class="card-top">
        <h3>${esc(dec(it.SVCNM))}</h3>
        ${stat ? `<span class="bed ${statCls}">${esc(stat)}</span>` : ""}
      </div>
      <p class="addr">📍 ${esc(dec(it.PLACENM))}${it.AREANM ? ` · ${esc(it.AREANM)}` : ""}</p>
      ${rcpt ? `<p class="meta">🗓️ 접수 ${esc(rcpt)}</p>` : ""}
      ${meta2 ? `<p class="meta">${meta2}</p>` : ""}
      <div class="card-actions">
        <button class="btn detail" data-svcid="${esc(it.SVCID)}" data-url="${esc(url)}">📋 상세</button>
        ${url ? `<a class="btn map" href="${esc(url)}" target="_blank" rel="noopener">🎫 예약</a>` : ""}
        ${mapLink(dec(it.PLACENM), it.Y, it.X)}
      </div>
    </article>`;
}

// ---------- 서울 예약 상세 모달 ----------
function openModal(html) {
  $("modalBody").innerHTML = html;
  $("modal").style.display = "";
  document.body.style.overflow = "hidden";
}
function closeModal() {
  $("modal").style.display = "none";
  document.body.style.overflow = "";
  $("modalBody").innerHTML = "";
}
async function openDetail(svcid, url) {
  if (!svcid) return;
  openModal('<p class="modal-loading">불러오는 중…</p>');
  try {
    const r = await fetch(`/api/seoul?detail=${encodeURIComponent(svcid)}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    const row = (data.rows || [])[0];
    if (!row) throw new Error("상세 정보를 찾을 수 없습니다.");
    row._url = url || "";
    $("modalBody").innerHTML = renderDetail(row);
  } catch (e) {
    $("modalBody").innerHTML = `<p class="status error">오류: ${esc(e.message)}</p>`;
  }
}
function dRow(label, val) {
  return val ? `<div class="d-row"><span>${label}</span><b>${esc(val)}</b></div>` : "";
}
function renderDetail(row) {
  const img = row.IMG_PATH ? `<img class="d-img" src="${esc(row.IMG_PATH)}" alt="" loading="lazy">` : "";
  const rcpt = (row.RCPTBGNDT || row.RCPTENDDT) ? `${fmtDT(row.RCPTBGNDT)} ~ ${fmtDT(row.RCPTENDDT)}` : "";
  const usetime = (row.V_MIN || row.V_MAX) ? `${row.V_MIN || ""} ~ ${row.V_MAX || ""}` : "";
  const place = [dec(row.PLACENM), dec(row.SUBPLACENM)].filter(Boolean).join(" · ");
  return `
    <h2 class="d-title">${esc(dec(row.SVCNM))}</h2>
    ${img}
    <div class="d-info">
      ${dRow("장소", place)}
      ${dRow("주소", dec(row.ADRES))}
      ${dRow("주관", dec(row.ORGNM))}
      ${dRow("전화", row.TELNO)}
      ${dRow("자치구", row.AREANM)}
      ${dRow("접수기간", rcpt)}
      ${dRow("이용시간", usetime)}
      ${dRow("모집인원", row.RCRPERCAP)}
    </div>
    ${row._url ? `<a class="btn map d-cta" href="${esc(row._url)}" target="_blank" rel="noopener">🎫 예약 페이지로 이동</a>` : ""}
    ${row.NOTICE ? `<details class="d-html" open><summary>안내사항</summary><div class="d-html-body">${row.NOTICE}</div></details>` : ""}
    ${row.DTLCONT ? `<details class="d-html"><summary>상세내용</summary><div class="d-html-body">${row.DTLCONT}</div></details>` : ""}`;
}

function renderEmergency(it) {
  const beds = num(it.hvec), op = num(it.hvoc), ward = num(it.hvgc);
  const ambulance = it.hvamyn === "Y";
  const badge = Number.isNaN(beds) ? "" :
    beds > 0 ? `<span class="bed ok">병상 ${beds}</span>` : `<span class="bed full">포화</span>`;
  return `
    <article class="card emergency">
      <div class="card-top">
        <h3>${esc(it.dutyName)}</h3>
        ${badge}
      </div>
      <p class="meta">입력시각: ${esc(it.hvidate || "-")}</p>
      <ul class="stats">
        <li><span>응급실 일반</span><b>${disp(beds)}</b></li>
        <li><span>수술실</span><b>${disp(op)}</b></li>
        <li><span>입원실 일반</span><b>${disp(ward)}</b></li>
        <li><span>구급차</span><b>${ambulance ? "가용" : "불가"}</b></li>
        <li><span>CT</span><b>${it.hvctayn === "Y" ? "○" : "×"}</b></li>
        <li><span>MRI</span><b>${it.hvmriayn === "Y" ? "○" : "×"}</b></li>
      </ul>
      <div class="card-actions">${telLink(it.dutyTel3)}</div>
    </article>`;
}

// ---------- 이벤트 ----------
document.querySelectorAll(".tab").forEach((b) =>
  b.addEventListener("click", () => setTab(b.dataset.tab)));
$("searchBtn").addEventListener("click", searchRegion);
$("geoBtn").addEventListener("click", searchGeo);
$("seoulBtn").addEventListener("click", searchSeoul);
$("subBtn").addEventListener("click", searchSubway);
$("keyword").addEventListener("keydown", (e) => { if (e.key === "Enter") searchRegion(); });
$("seoulKw").addEventListener("keydown", (e) => { if (e.key === "Enter") searchSeoul(); });
$("subQ").addEventListener("keydown", (e) => { if (e.key === "Enter") searchSubway(); });

// 상세 버튼(동적 생성) — 이벤트 위임
$("results").addEventListener("click", (e) => {
  const b = e.target.closest(".detail");
  if (b) openDetail(b.dataset.svcid, b.dataset.url);
});
$("modalClose").addEventListener("click", closeModal);
$("modalBackdrop").addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("modal").style.display !== "none") closeModal();
});

initRegions();
initSeoulArea();
initSevere();
initSubLine();
setTab("emergency");
