// ===== 공공의료 정보 찾기 — 프론트엔드 로직 =====
const TABS = {
  emergency: {
    op: "getEmrrmRltmUsefulSckbdInfoInqire",
    sigunguRequired: true,
    showKeyword: false,
    // STAGE1/STAGE2 파라미터 사용
    params: (sido, sigungu) => ({ STAGE1: sido, STAGE2: sigungu }),
    render: renderEmergency,
  },
  hospital: {
    op: "getHsptlMdcncListInfoInqire",
    sigunguRequired: false,
    showKeyword: true,
    params: (sido, sigungu, kw) => ({ Q0: sido, Q1: sigungu, QN: kw, ORD: "NAME" }),
    render: renderFacility,
  },
  pharmacy: {
    op: "getParmacyListInfoInqire",
    sigunguRequired: false,
    showKeyword: true,
    params: (sido, sigungu, kw) => ({ Q0: sido, Q1: sigungu, QN: kw, ORD: "NAME" }),
    render: renderFacility,
  },
};

let currentTab = "emergency";

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
  const cfg = TABS[tab];
  $("keyword-field").style.display = cfg.showKeyword ? "" : "none";
  $("hint").textContent = cfg.sigunguRequired
    ? "※ 응급실 실시간 가용병상은 시/군/구까지 선택해야 조회됩니다."
    : "";
  $("results").innerHTML = "";
  $("status").textContent = "";
}

// ---------- 조회 ----------
async function search() {
  const cfg = TABS[currentTab];
  const sido = sidoSel.value;
  const sigungu = sigunguSel.value;
  const kw = $("keyword").value.trim();

  if (!sido) return setStatus("시/도를 선택하세요.", "warn");
  if (cfg.sigunguRequired && !sigungu)
    return setStatus("응급실 조회는 시/군/구를 선택해야 합니다.", "warn");

  setStatus("조회 중…", "loading");
  $("results").innerHTML = "";

  const p = cfg.params(sido, sigungu, kw);
  const qs = new URLSearchParams({ service: currentTab, op: cfg.op, numOfRows: "50" });
  for (const [k, v] of Object.entries(p)) if (v) qs.set(k, v);

  try {
    const r = await fetch(`/api/proxy?${qs.toString()}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    if (data.resultCode && data.resultCode !== "00")
      throw new Error(`API 오류 [${data.resultCode}] ${data.resultMsg}`);

    if (!data.items.length) return setStatus("조회 결과가 없습니다.", "warn");
    setStatus(`총 ${data.totalCount}건 중 ${data.items.length}건 표시`, "ok");
    $("results").innerHTML = data.items.map(cfg.render).join("");
  } catch (e) {
    setStatus(`오류: ${e.message}`, "error");
  }
}

function setStatus(msg, type = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = "status " + type;
}

// ---------- 렌더러 ----------
const DAY = ["일","월","화","수","목","금","토"];
function todayHours(it) {
  // dutyTime{N}s ~ {N}c : N=1(월)~7(일), 8(공휴일)
  const jsDay = new Date().getDay(); // 0=일
  const n = jsDay === 0 ? 7 : jsDay;
  const s = it[`dutyTime${n}s`];
  const c = it[`dutyTime${n}c`];
  if (!s || !c) return "운영시간 정보 없음";
  return `오늘(${DAY[jsDay]}) ${fmt(s)} ~ ${fmt(c)}`;
}
const fmt = (t) => (t && t.length === 4 ? `${t.slice(0,2)}:${t.slice(2)}` : t || "");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

function renderFacility(it) {
  const tel = it.dutyTel1 || "";
  const lat = it.wgs84Lat, lon = it.wgs84Lon;
  const map = lat && lon ? `https://map.kakao.com/link/map/${encodeURIComponent(it.dutyName)},${lat},${lon}` : "";
  return `
    <article class="card">
      <h3>${esc(it.dutyName)}</h3>
      <p class="addr">📍 ${esc(it.dutyAddr)}</p>
      <p class="hours">🕒 ${esc(todayHours(it))}</p>
      <div class="card-actions">
        ${tel ? `<a class="btn tel" href="tel:${esc(tel).replace(/[^0-9]/g,"")}">📞 ${esc(tel)}</a>` : ""}
        ${map ? `<a class="btn map" href="${map}" target="_blank" rel="noopener">🗺️ 지도</a>` : ""}
      </div>
    </article>`;
}

function renderEmergency(it) {
  const beds = num(it.hvec);          // 응급실 일반병상
  const op = num(it.hvoc);            // 수술실
  const ward = num(it.hvgc);          // 입원실 일반
  const ambulance = it.hvamyn === "Y";
  const tel = it.dutyTel3 || "";
  const badge = beds === null ? "" :
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
      <div class="card-actions">
        ${tel ? `<a class="btn tel" href="tel:${esc(tel).replace(/[^0-9]/g,"")}">📞 응급실 ${esc(tel)}</a>` : ""}
      </div>
    </article>`;
}
const num = (v) => (v === undefined || v === "" || v === null ? null : Number(v));
const disp = (v) => (v === null || Number.isNaN(v) ? "-" : v);

// ---------- 이벤트 ----------
document.querySelectorAll(".tab").forEach((b) =>
  b.addEventListener("click", () => setTab(b.dataset.tab)));
$("searchBtn").addEventListener("click", search);
$("keyword").addEventListener("keydown", (e) => { if (e.key === "Enter") search(); });

initRegions();
setTab("emergency");
