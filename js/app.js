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

function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll(".mode").forEach((b) =>
    b.classList.toggle("active", b.dataset.mode === mode.id));

  const isGeo = mode.input === "geo";
  document.querySelectorAll(".region-only").forEach((el) =>
    el.style.display = isGeo ? "none" : "");
  $("geoBtn").style.display = isGeo ? "" : "none";
  if (!isGeo) $("keyword-field").style.display = mode.keyword ? "" : "none";

  $("hint").textContent = mode.hint || (isGeo ? "📍 브라우저 위치 권한이 필요합니다. 가까운 순으로 정렬됩니다." : "");
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
$("keyword").addEventListener("keydown", (e) => { if (e.key === "Enter") searchRegion(); });

initRegions();
setTab("emergency");
