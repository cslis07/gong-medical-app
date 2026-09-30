// ===== 생활서비스 확장 로직 (혼잡도·분실물·로또·주유소·따릉이·고속도로 등) =====
// 지하철(app.js)과 별개 <script>. 전역 충돌을 피하려 helper 이름을 app.js와 다르게 둔다.
const byId = (id) => document.getElementById(id);
const E = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// E()는 속성 탈출만 막고 스킴은 못 막는다. 외부 API가 준 URL을 href에 넣기 전에 반드시 통과시킬 것.
// (javascript: / data: 스킴이 들어오면 클릭 한 번에 임의 스크립트가 실행된다)
const safeUrl = (u) => (/^https?:\/\//i.test(String(u ?? "")) ? String(u) : "");
function setBox(id, msg, type = "") {
  const el = byId(id);
  if (!el) return;
  el.textContent = msg;
  el.className = "status " + type;
  el.setAttribute("aria-live", "polite");   // 상태 변화를 스크린리더가 읽도록
}
// 로딩 중 결과 영역을 백지로 두지 않고 스켈레톤 카드를 보인다.
function showSkeletons(resultsId, n = 6) {
  const el = byId(resultsId);
  if (!el) return;
  el.innerHTML = `<div class="skeletons">${Array.from({ length: n }, () =>
    `<div class="skel-card"><div class="skel title"></div><div class="skel line"></div><div class="skel line short"></div></div>`).join("")}</div>`;
}
// 결과 0건 안내 — 스켈레톤을 지우고 빈 상태 카드로 교체한 뒤 상태줄도 갱신
const emptyState = (msg) => `<div class="empty-state"><div class="empty-ico">🔍</div><p>${E(msg)}</p></div>`;
function endEmpty(resultsId, statusId, msg, type = "warn") {
  const el = byId(resultsId); if (el) el.innerHTML = emptyState(msg);
  if (window.GongMap) GongMap.clearByResults(resultsId);   // 이전 지도 핀/토글 제거
  return setBox(statusId, msg, type);
}
function kstTodayISO() { const d = new Date(Date.now() + 9 * 3600e3); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`; }
// 실시간 데이터 기준 시각(KST HH:MM) — 낡음 여부를 사용자가 볼 수 있게
function kstClock() { const d = new Date(Date.now() + 9 * 3600e3); return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; }
const ymd = (iso) => String(iso || "").replace(/-/g, "");

// ---------- 상단 내비: 홈 → 카테고리(교통·주거·생활) → 서브탭 ----------
// 탭을 location.hash에 반영해 새로고침 복원·링크 공유가 되게 한다(#parking 등).
// data-off="1" 탭은 숨김 처리(비활성) — 네비·해시 이동 대상에서 제외
// "home"은 .toptab 이 없는 특수 패널(허브)이라 목록에 손으로 넣는다.
// ⚠️ .toptab 줄은 2026-08-12부터 화면에 없다(카테고리 바·서브탭 줄 제거). 그래도
//    이 셀렉터가 홈 카드·data-off 계약의 원본이라 DOM 에는 그대로 살아 있다.
const HOME = "home";
const toptabEls = () => [...document.querySelectorAll(".toptab:not([data-off])")];
const panelNames = () => [HOME, ...toptabEls().map((b) => b.dataset.panel)];
const catOf = (name) => document.querySelector(`.toptab[data-panel="${name}"]`)?.dataset.cat || null;
// 카테고리 바 제거로 현재 미사용 — 되살릴 때 필요해 남겨 둔다(삭제 금지 목록과 같은 취지).
const firstTabOfCat = (cat) => document.querySelector(`.toptab[data-cat="${cat}"]:not([data-off])`)?.dataset.panel || null;

// 카테고리 바만 갱신하고 그 안의 서브탭만 보이게 한다(패널 전환 없이).
// 2026-08-12 카테고리 바·서브탭 줄 제거로 «현재 미사용» — 되살릴 때 필요해 남겨 둔다.
function showCategory(cat) {
  document.querySelectorAll(".cattab").forEach((c) => {
    const on = c.dataset.cat === cat;
    c.classList.toggle("active", on);
    c.setAttribute("aria-selected", on ? "true" : "false");
  });
  toptabEls().forEach((b) => { b.hidden = b.dataset.cat !== cat; });
}

function switchPanel(name, { updateHash = true } = {}) {
  if (!panelNames().includes(name)) return;
  const isHome = name === HOME;
  // 탭 안에서 홈으로 돌아갈 유일한 길 — 결과가 길어도 닿게 내비 줄을 sticky 로 띄운다.
  const back = byId("backHome");
  if (back) back.hidden = isHome;
  document.querySelector(".topnav")?.classList.toggle("nav-bar", !isHome);
  // 지금 어느 화면인지 — 라벨은 숨은 .toptab 을 그대로 읽는다(이름의 원본은 하나)
  const here = byId("hereNow");
  if (here) {
    here.hidden = isHome;
    if (!isHome) here.textContent = document.querySelector(`.toptab[data-panel="${name}"]`)?.textContent.trim() || "";
  }
  // .toptab 은 화면에 없지만 상태(active)는 유지한다 — 즐겨찾기·해시 로직이 읽는다.
  toptabEls().forEach((b) => {
    const on = !isHome && b.dataset.panel === name;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === `panel-${name}`));
  if (updateHash && location.hash.slice(1) !== name) history.replaceState(null, "", `#${name}`);
  if (name === "gas") { loadGasAvg(); loadGasTrend(); }
  // 노선도는 홈이 첫 화면이 되면서 «숨은 상태»로 그려질 수 있다(폭 0 → 최소값으로 굳음).
  // 지하철 탭이 실제로 보이는 지금 다시 맞춘다. app.js initMapZoom 이 등록한다.
  if (name === "subway") window.__refitSubwayMap?.();
}

byId("backHome")?.addEventListener("click", () => switchPanel(HOME));

// ---------- 🏠 홈 허브 ----------
// 카드에 붙일 설명·대표색. key = .toptab 의 data-panel.
// ⚠️ 무엇을 뿌릴지 정하는 건 이 표가 아니라 index.html 의 .toptab 목록이다(renderHub 가 읽음).
// hero: 1 이면 위쪽 «자주 찾는 정보» 큰 카드에도 함께 노출한다.
const HUB = {
  subway:     { hue: "#2f5fe0", hero: 1, desc: "노선도에서 역을 눌러 실시간 도착·첫차막차까지" },
  nearby:     { hue: "#0f7a4d", hero: 1, desc: "현위치 기준 주유소·따릉이·주차장을 한 번에" },
  parking:    { hue: "#7c3aed", hero: 1, desc: "가까운 주차장 · 서울 일부는 실시간 잔여면수" },
  clinic:     { hue: "#c2410c", hero: 1, desc: "지금 문 연 병의원 · 거리·전화·지도" },
  pharmacy:   { hue: "#0d9488", desc: "지금 문 연 약국 · 오늘 영업시간·전화" },
  emergency:  { hue: "#dc2626", desc: "가까운 응급실 실시간 가용 병상" },
  gas:        { hue: "#b45309", desc: "반경 내 최저가 주유소와 유가 추이" },
  bike:       { hue: "#0891b2", desc: "주변 대여소의 남은 자전거·거치대" },
  highway:    { hue: "#475569", desc: "휴게소·실시간 소통·돌발·구간 소요시간" },
  density:    { hue: "#db2777", desc: "서울 주요 장소의 실시간 인구 혼잡도" },
};
function renderHub() {
  const hero = byId("hubHero"), all = byId("hubAll");
  if (!hero || !all) return;
  const tabs = toptabEls();
  // 탭 라벨은 "🚇 지하철" 꼴 — 첫 공백 앞이 아이콘, 뒤가 이름.
  const parts = (b) => {
    const label = b.textContent.trim(), i = label.indexOf(" ");
    return { ic: i > 0 ? label.slice(0, i) : "•", nm: i > 0 ? label.slice(i + 1).trim() : label };
  };
  const card = (b, big) => {
    const p = b.dataset.panel, m = HUB[p] || {}, { ic, nm } = parts(b);
    return `<button type="button" class="hub-card" data-panel="${E(p)}" style="--hue:${E(m.hue || "#3b6ef5")}">
      <span class="hub-ic" aria-hidden="true">${E(ic)}</span>${big
        ? `<span class="hub-tx"><span class="hub-nm">${E(nm)}</span><span class="hub-desc">${E(m.desc || "")}</span></span>`
        : `<span class="hub-nm">${E(nm)}</span>`}
    </button>`;
  };
  const heroTabs = tabs.filter((b) => HUB[b.dataset.panel]?.hero);
  hero.innerHTML = heroTabs.map((b) => card(b, true)).join("");
  // 히어로 4개가 전부 숨겨진 경우(전부 data-off) 제목까지 같이 감춘다
  const sec = byId("hubHeroSec");
  if (sec) sec.hidden = !heroTabs.length;
  hero.hidden = !heroTabs.length;
  all.innerHTML = tabs.map((b) => card(b, false)).join("");
  const cnt = byId("hubCount"); if (cnt) cnt.textContent = `${tabs.length}개`;
}
byId("panel-home")?.addEventListener("click", (e) => {
  const c = e.target.closest(".hub-card");
  if (c) switchPanel(c.dataset.panel);
});
// 즐겨찾기 모아보기는 favorites.js가 푸터에 심는 버튼이 원본이다(로직 중복 없이 위임).
byId("hubFav")?.addEventListener("click", () => byId("favDash")?.click());

// 새로고침·뒤로가기·직접 링크로 들어온 경우 해당 탭을 연다.
function applyHashPanel() {
  const name = location.hash.slice(1);
  if (panelNames().includes(name)) switchPanel(name, { updateHash: false });
}
window.addEventListener("hashchange", applyHashPanel);
// 전국 평균유가 (1회 로드)
let gasAvgLoaded = false;
async function loadGasAvg() {
  if (gasAvgLoaded) return; gasAvgLoaded = true;
  try {
    const d = await (await fetch("/api/gas?op=avg")).json();
    if (!d.ok || !d.avg) return;
    const pick = d.avg.filter((a) => ["B027", "D047", "K015"].includes(a.prodcd));
    byId("gasAvg").innerHTML = `<span class="ga-label">전국 평균</span>` + pick.map((a) => {
      const up = a.diff > 0, dn = a.diff < 0;
      return `<span class="ga-item">${E(a.name)} <b>${a.price ? a.price.toLocaleString() : "-"}</b>원 <span class="ga-diff ${up ? "up" : dn ? "dn" : ""}">${up ? "▲" : dn ? "▼" : ""}${Math.abs(a.diff).toFixed(2)}</span></span>`;
    }).join("");
  } catch { gasAvgLoaded = false; }
}
// 선택 유종 최근 7일 평균유가 추이 스파크라인
let gasTrendProd = null;
async function loadGasTrend() {
  const prodcd = byId("gasProd").value;
  if (gasTrendProd === prodcd) return;
  try {
    const d = await (await fetch(`/api/gas?op=recent&prodcd=${prodcd}`)).json();
    const series = d.ok ? (d.series || []) : [];
    if (series.length < 2) { byId("gasTrend").innerHTML = ""; gasTrendProd = null; return; }
    gasTrendProd = prodcd;
    const name = byId("gasProd").selectedOptions[0]?.text || "";
    byId("gasTrend").innerHTML = renderGasSparkline(series, name);
  } catch { byId("gasTrend").innerHTML = ""; gasTrendProd = null; }
}
function renderGasSparkline(series, name) {
  const prices = series.map((s) => s.price);
  const min = Math.min(...prices), max = Math.max(...prices), n = series.length;
  const W = 280, H = 46, pad = 5;
  const x = (i) => pad + i * ((W - pad * 2) / (n - 1));
  const y = (v) => (max === min ? H / 2 : H - pad - ((v - min) / (max - min)) * (H - pad * 2));
  const pts = series.map((s, i) => `${x(i).toFixed(1)},${y(s.price).toFixed(1)}`).join(" ");
  const last = prices[n - 1], diff = last - prices[0];
  const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "−", cls = diff > 0 ? "up" : diff < 0 ? "dn" : "";
  const fmtD = (d) => `${d.slice(4, 6)}.${d.slice(6, 8)}`;
  return `<div class="gas-trend-in">
    <span class="gt-label">📈 최근 7일 ${E(name)} <span class="opt">${E(fmtD(series[0].date))}~${E(fmtD(series[n - 1].date))}</span></span>
    <svg viewBox="0 0 ${W} ${H}" class="gt-svg" role="img" aria-label="최근 7일 평균유가 추이">
      <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${x(n - 1).toFixed(1)}" cy="${y(last).toFixed(1)}" r="2.6" fill="var(--accent)"/>
    </svg>
    <span class="gt-val"><b>${last.toLocaleString()}</b>원/L <span class="gt-diff ${cls}">${arrow}${Math.abs(diff).toFixed(1)}</span></span>
  </div>`;
}
document.querySelectorAll(".toptab").forEach((b) => b.addEventListener("click", () => switchPanel(b.dataset.panel)));
byId("gasProd").addEventListener("change", () => { gasTrendProd = null; loadGasTrend(); });

// 오류 재시도 박스 (app.js showError와 동일 톤)
// 브라우저·네트워크 오류 원문(대개 영문)을 사람이 읽는 한국어로 바꾼다.
// e.message("Failed to fetch"/"The operation was aborted" 등)를 사용자에게 그대로 노출하지 않기 위함.
function friendlyErr(e) {
  const m = String((e && e.message) || e || "");
  if (/abort|timeout|시간 ?초과|지연/i.test(m)) return "서버 응답이 지연돼 중단했어요. 잠시 후 다시 시도해 주세요.";
  if (/Failed to fetch|NetworkError|net::|load failed|network|연결/i.test(m)) return "네트워크 연결이 불안정해요. 연결을 확인하고 다시 시도해 주세요.";
  if (/JSON|Unexpected token|parse/i.test(m)) return "서버 응답을 읽지 못했어요. 잠시 후 다시 시도해 주세요.";
  return m ? `일시적인 오류가 발생했어요. (${m})` : "일시적인 오류가 발생했어요.";
}
function retryBox(resultsId, msg, retryFn) {
  if (window.GongMap) GongMap.clearByResults(resultsId);   // 오류 시 이전 지도 핀/토글 제거
  const timeout = /시간 ?초과|timeout|Failed to fetch|network|abort|지연/i.test(msg);
  byId(resultsId).innerHTML =
    `<div class="retry-box"><div class="retry-ico">${timeout ? "⏱️" : "⚠️"}</div>
      <p class="retry-msg">${E(friendlyErr({ message: msg }))}</p>
      <p class="retry-sub">외부 공공/공식 서비스가 일시적으로 불안정할 수 있습니다.</p>
      <button class="search-btn retry-btn">🔄 다시 시도</button></div>`;
  const btn = byId(resultsId).querySelector(".retry-btn");
  if (btn && retryFn) btn.addEventListener("click", retryFn);
}

// ---------- 공통 페이지네이션 ----------
// 현재 페이지 주변 ±2와 처음·끝을 보여주고 사이는 …으로 접는다.
function pageWindow(page, totalPages) {
  const keep = new Set([1, totalPages, page - 2, page - 1, page, page + 1, page + 2]);
  const nums = [...keep].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => { if (i && n - nums[i - 1] > 1) out.push("…"); out.push(n); });
  return out;
}
/**
 * pagerId 컨테이너에 페이지 버튼을 그린다.
 * onGo(page)는 페이지 이동 시 호출. total은 전체 건수(표시용, 선택).
 */
function renderPager(pagerId, page, totalPages, onGo, total) {
  const el = byId(pagerId);
  if (!el) return;
  if (totalPages <= 1) { el.innerHTML = ""; return; }
  const btn = (label, target, opts = {}) =>
    `<button type="button" data-page="${target}"${opts.disabled ? " disabled" : ""}${opts.current ? ' aria-current="page"' : ""}${opts.label ? ` aria-label="${opts.label}"` : ""}>${label}</button>`;

  el.innerHTML =
    btn("‹", page - 1, { disabled: page <= 1, label: "이전 페이지" }) +
    pageWindow(page, totalPages).map((n) =>
      n === "…" ? '<span class="pager-gap">…</span>' : btn(String(n), n, { current: n === page })).join("") +
    btn("›", page + 1, { disabled: page >= totalPages, label: "다음 페이지" }) +
    `<span class="pager-info">${page} / ${totalPages} 페이지${total != null ? ` · 전체 ${total.toLocaleString()}건` : ""}</span>`;

  el.querySelectorAll("button[data-page]").forEach((b) =>
    b.addEventListener("click", () => {
      const p = Number(b.dataset.page);
      if (p >= 1 && p <= totalPages && p !== page) onGo(p);
    }));
}
// 페이지 이동 후 결과 목록 상단으로 (모바일에서 하단 페이저를 누르면 화면이 어긋난다)
const scrollToResults = (resultsId) => byId(resultsId)?.scrollIntoView({ behavior: "smooth", block: "start" });
const clearPager = (pagerId) => { const el = byId(pagerId); if (el) el.innerHTML = ""; };

// ==================== 👥 실시간 혼잡도 ====================
const DENSITY_AREAS = ["경복궁","광화문·덕수궁","보신각","창덕궁·종묘","동대문 관광특구","명동 관광특구","이태원 관광특구","잠실 관광특구","종로·청계 관광특구","홍대 관광특구","강서한강공원","고척돔","광나루한강공원","광화문광장","국립중앙박물관·용산가족공원","난지한강공원","남산공원","노들섬","뚝섬한강공원","망원한강공원","반포한강공원","보라매공원","북서울꿈의숲","서대문독립공원","서리풀공원·몽마르뜨공원","서울대공원","서울숲공원","송현녹지광장","아차산","안양천","양화한강공원","어린이대공원","여의도한강공원","여의서로","올림픽공원","월드컵공원","응봉산","이촌한강공원","잠실종합운동장","잠실한강공원","잠원한강공원","청계산","홍제폭포","가락시장","가로수길","광장(전통)시장","김포공항","남대문시장","노량진","덕수궁길·정동길","북창동 먹자골목","북촌한옥마을","서촌","성수카페거리","송리단길·호수단길","신촌 스타광장","압구정로데오거리","여의도","연남동","영등포 타임스퀘어","용리단길","이태원 앤틱가구거리","익선동","인사동","잠실롯데타워·석촌호수","창동 신경제 중심지","청담동 명품거리","청량리 제기동 일대 전통시장","해방촌·경리단길","가산디지털단지역","강남역","건대입구역","고덕역","고속터미널역","교대역","구로디지털단지역","구로역","군자역","대림역","동대문역","뚝섬역","미아사거리역","발산역","사당역","삼각지역","서울대입구역","서울식물원·마곡나루역","서울역","성신여대입구역","선릉역","수유역","신논현역·논현역","신도림역","신림역","신촌·이대역","쌍문역","신정네거리역","역삼역","연신내역","양재역","왕십리역","용산역","오목교역·목동운동장","잠실새내역","잠실역","장지역","장한평역","천호역","총신대입구(이수)역","충정로역","합정역","혜화역","홍대입구역(2호선)","회기역"];
const DENSITY_LEVEL = { "여유": "ok", "보통": "warn", "약간 붐빔": "busy", "붐빔": "full" };
byId("densList").innerHTML = DENSITY_AREAS.map((a) => `<option value="${E(a)}"></option>`).join("");

async function searchDensity() {
  const area = byId("densQ").value.trim();
  if (!area) return setBox("densStatus", "장소명을 입력하세요.", "warn");
  setBox("densStatus", "조회 중…", "loading"); showSkeletons("densResults", 3);
  try {
    const r = await fetch(`/api/density?area=${encodeURIComponent(area)}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    const rows = d.rows || [];
    if (!rows.length) return endEmpty("densResults", "densStatus", `'${area}' 실시간 데이터가 없습니다. 목록의 정확한 장소명으로 다시 시도하세요.`, "warn");
    setBox("densStatus", `${rows.length}곳 · ${kstClock()} 기준`, "ok");
    byId("densResults").innerHTML = rows.map(renderDensity).join("");
  } catch (e) { setBox("densStatus", friendlyErr(e), "error"); retryBox("densResults", e.message, searchDensity); }
}
function renderDensity(it) {
  const lv = DENSITY_LEVEL[it.level] || "warn";
  const ages = Object.entries(it.ageRates || {}).map(([k, v]) => ({ k, v: Number(v || 0) })).sort((a, b) => b.v - a.v);
  const top = ages.slice(0, 3).map((a) => `${a.k} ${a.v}%`).join(" · ");
  return `
    <article class="card">
      <div class="card-top"><h3>${E(it.area)}</h3><span class="bed ${lv}">${E(it.level || "-")}</span></div>
      <p class="meta">🕒 ${E(it.time || "")} 기준</p>
      <p class="ppl">👥 추정 <b>${Number(it.pplMin || 0).toLocaleString()} ~ ${Number(it.pplMax || 0).toLocaleString()}</b>명</p>
      <p class="meta">${E(it.msg || "")}</p>
      <ul class="stats">
        <li><span>남</span><b>${E(it.maleRate)}%</b></li>
        <li><span>여</span><b>${E(it.femaleRate)}%</b></li>
        <li><span>상주/비상주</span><b>${E(it.residentRate)}/${E(it.nonResidentRate)}</b></li>
      </ul>
      <p class="meta">연령 상위: ${E(top)}</p>
    </article>`;
}
byId("densBtn").addEventListener("click", searchDensity);
byId("densQ").addEventListener("keydown", (e) => { if (e.key === "Enter") searchDensity(); });
byId("densQ").addEventListener("change", searchDensity); // datalist 선택 시

// ==================== ⛽ 주유소 ====================
// GPS 좌표를 탭 간에 공유한다. 주유소→따릉이→버스→주차장을 옮길 때마다 위치 권한을
// 다시 묻던 마찰 제거. 신선도 5분, 강제 갱신은 forceFresh 또는 헤더의 "위치 갱신".
let lastLoc = null;         // { lat, lon, ts }
const LOC_TTL = 5 * 60 * 1000;
function clearLocCache() { lastLoc = null; }
// 공용 위치 획득 — 주소 입력(addrInputId)이 있으면 vworld 지오코딩 우선, 없으면 브라우저 geolocation(캐시)
async function getLocation(statusId, addrInputId, { forceFresh = false } = {}) {
  const addr = addrInputId && byId(addrInputId) ? byId(addrInputId).value.trim() : "";
  if (addr) {
    setBox(statusId, `'${addr}' 위치 확인 중…`, "loading");
    const d = await (await fetch(`/api/geocode?q=${encodeURIComponent(addr)}`)).json();
    if (!d.ok) throw new Error(d.message || d.error || "주소를 찾을 수 없습니다.");
    return { lat: d.lat, lon: d.lon };   // 주소 조회는 캐시하지 않는다(내 위치와 구분)
  }
  if (!forceFresh && lastLoc && Date.now() - lastLoc.ts < LOC_TTL) {
    return { lat: lastLoc.lat, lon: lastLoc.lon };   // 최근 GPS 재사용 — 권한 재요청 없음
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("이 브라우저는 위치 기능을 지원하지 않습니다. 주소를 입력해보세요."));
    setBox(statusId, "위치 확인 중… (권한을 허용해주세요)", "loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => { lastLoc = { lat: pos.coords.latitude, lon: pos.coords.longitude, ts: Date.now() }; resolve({ lat: lastLoc.lat, lon: lastLoc.lon }); },
      (err) => reject(new Error(err.code === 1 ? "위치 권한이 거부되었습니다. 주소를 입력하거나 권한을 허용해주세요." : `위치 확인 실패: ${err.message}`)),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}
let gasCache = { rows: [], radius: 3000 };
async function searchGas() {
  try {
    const { lat, lon } = await getLocation("gasStatus", "gasAddr");
    const prodcd = byId("gasProd").value, radius = byId("gasRadius").value;
    setBox("gasStatus", "주유소 조회 중…", "loading"); showSkeletons("gasResults");
    const r = await fetch(`/api/gas?lat=${lat}&lon=${lon}&prodcd=${prodcd}&radius=${radius}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    if (d.needKey) return endEmpty("gasResults", "gasStatus", "⚠️ 주유소 기능은 OPINET 인증키 설정 후 이용 가능합니다.", "warn");
    const rows = d.rows || [];
    if (!rows.length) return endEmpty("gasResults", "gasStatus", d.message || "반경 내 주유소가 없습니다.", "warn");
    gasCache = { rows, radius: Number(d.radius) || Number(radius), center: { lat, lon } };
    fillGasBrands(rows);
    applyGasFilter();
  } catch (e) { setBox("gasStatus", friendlyErr(e), "error"); retryBox("gasResults", e.message, searchGas); }
}
// 반경 내에 실제로 존재하는 브랜드만 필터 옵션으로 채운다.
function fillGasBrands(rows) {
  const sel = byId("gasFilter"), cur = sel.value;
  const brands = [...new Set(rows.map((r) => r.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  sel.innerHTML = `<option value="">전체 브랜드</option>` + brands.map((b) => `<option value="${E(b)}">${E(b)}</option>`).join("");
  if (brands.includes(cur)) sel.value = cur;
}
function applyGasFilter() {
  const { rows, radius } = gasCache;
  if (!rows.length) return;
  const brand = byId("gasFilter").value;
  const sort = byId("gasSort") ? byId("gasSort").value : "price";
  let out = (brand ? rows.filter((s) => s.brand === brand) : rows).slice();
  if (!out.length) return endEmpty("gasResults", "gasStatus", `${brand} 주유소가 반경 내에 없습니다.`, "warn");
  out.sort((a, b) => sort === "dist" ? (a.distance || 0) - (b.distance || 0) : (a.price || Infinity) - (b.price || Infinity));
  setBox("gasStatus", `${sort === "dist" ? "거리순" : "가격순"} ${out.length}곳${brand ? ` · ${brand}` : ""} (반경 ${radius / 1000}km)`, "ok");
  byId("gasResults").innerHTML = out.map((s, i) => renderGas(s, i, sort)).join("");
  if (window.GongMap) GongMap.set("gas", out.map((s) => ({ lat: s.lat, lon: s.lon, label: s.name, sub: `${s.price ? s.price.toLocaleString() + "원/L" : ""}${s.brand ? " · " + s.brand : ""}` })), gasCache.center);
}
function renderGas(s, i, sort = "price") {
  const chips = [s.carWash ? "세차장" : "", s.maint ? "경정비" : "", s.cvs ? "편의점" : "", s.kpetro ? "품질인증" : ""]
    .filter(Boolean).map((c) => `<span class="chip">${E(c)}</span>`).join("");
  const map = s.address ? `<a class="btn map" href="https://map.kakao.com/link/search/${encodeURIComponent(s.name)}" target="_blank" rel="noopener">🗺️ 지도</a>` : "";
  const tel = s.tel ? `<a class="btn tel" href="tel:${E(s.tel).replace(/[^0-9]/g, "")}">📞 ${E(s.tel)}</a>` : "";
  const medal = i === 0 ? (sort === "dist" ? "📍 " : "🥇 ") : "";
  return `<article class="card">
    <div class="card-top"><h3>${medal}${E(s.name)}</h3>
      <span class="bed ok">${s.price ? s.price.toLocaleString() + "원/L" : "-"}</span></div>
    <p class="meta">${E(s.brand)}${s.distance ? " · " + s.distance.toLocaleString() + "m" : ""}</p>
    ${s.address ? `<p class="addr">📍 ${E(s.address)}</p>` : ""}
    ${chips ? `<div class="chips">${chips}</div>` : ""}
    <div class="card-actions">${tel}${map}</div>
  </article>`;
}
byId("gasBtn").addEventListener("click", searchGas);
byId("gasFilter").addEventListener("change", () => { if (gasCache.rows.length) applyGasFilter(); });
byId("gasSort").addEventListener("change", () => { if (gasCache.rows.length) applyGasFilter(); });

// ==================== 🚲 따릉이 ====================
let bikeCache = { rows: [], center: null };
async function searchBike() {
  try {
    const { lat, lon } = await getLocation("bikeStatus", "bikeAddr");
    setBox("bikeStatus", "대여소 조회 중…", "loading"); showSkeletons("bikeResults");
    const r = await fetch(`/api/bike?lat=${lat}&lon=${lon}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    const rows = d.rows || [];
    if (!rows.length) return endEmpty("bikeResults", "bikeStatus", d.message || "주변 대여소가 없습니다.", "warn");
    bikeCache = { rows, center: { lat, lon } };
    applyBikeSort();
  } catch (e) { setBox("bikeStatus", friendlyErr(e), "error"); retryBox("bikeResults", e.message, searchBike); }
}
function applyBikeSort() {
  const { rows, center } = bikeCache;
  if (!rows.length) return;
  const sort = byId("bikeSort") ? byId("bikeSort").value : "dist";
  const out = rows.slice().sort((a, b) => sort === "bikes" ? (b.bikes || 0) - (a.bikes || 0) : (a.distance || 0) - (b.distance || 0));
  setBox("bikeStatus", `${sort === "bikes" ? "자전거 많은순" : "가까운 순"} 대여소 ${out.length}곳 · ${kstClock()} 기준`, "ok");
  byId("bikeResults").innerHTML = out.map((s) => {
    const lvl = s.bikes === 0 ? "full" : s.bikes <= 2 ? "busy" : "ok";
    const map = `<a class="btn map" href="https://map.kakao.com/link/map/${encodeURIComponent(s.name)},${s.lat},${s.lon}" target="_blank" rel="noopener">🗺️ 지도</a>`;
    return `<article class="card">
      <div class="card-top"><h3>${E(s.name)}</h3><span class="bed ${lvl}">자전거 ${s.bikes}대</span></div>
      <p class="meta">🚲 거치대 ${s.racks}개 · 📍 ${s.distance.toLocaleString()}m</p>
      <div class="card-actions">${map}</div>
    </article>`;
  }).join("");
  if (window.GongMap) GongMap.set("bike", out.map((s) => ({ lat: s.lat, lon: s.lon, label: s.name, sub: `자전거 ${s.bikes}대 · 거치대 ${s.racks}개` })), center);
}
byId("bikeBtn").addEventListener("click", searchBike);
byId("bikeSort").addEventListener("change", () => { if (bikeCache.rows.length) applyBikeSort(); });

// ==================== 🛣️ 고속도로 (휴게소 + 소통 + 돌발 + 구간 소요시간) ====================
function syncHwMode() {
  const m = byId("hwMode").value;
  byId("panel-highway").querySelector(".hw-rest").style.display = m === "rest" ? "" : "none";
  byId("panel-highway").querySelectorAll(".hw-tt").forEach((el) => { el.style.display = m === "traveltime" ? "" : "none"; });
  if (m === "traveltime") loadTollgates();
}
byId("hwMode").addEventListener("change", syncHwMode);
// 영업소 목록(드롭다운) 1회 로드 — 이름→코드 매핑
let tollgateMap = null;
async function loadTollgates() {
  if (tollgateMap) return;
  try {
    const d = await (await fetch("/api/highway?op=tollgates")).json();
    const list = (d.ok && d.list) || [];
    if (!list.length) return;
    tollgateMap = new Map(list.map((t) => [t.name, t.code]));
    const opts = list.map((t) => `<option value="${E(t.name)}"></option>`).join("");
    byId("ttStartList").innerHTML = opts;
    byId("ttEndList").innerHTML = opts;
  } catch { /* 실패 시 조회 때 재시도 */ }
}
async function searchTravelTime() {
  if (!tollgateMap) await loadTollgates();
  const sName = byId("ttStart").value.trim(), eName = byId("ttEnd").value.trim();
  const start = tollgateMap && tollgateMap.get(sName), end = tollgateMap && tollgateMap.get(eName);
  if (!start || !end) return setBox("hwStatus", "목록에서 출발·도착 영업소를 정확히 선택하세요.", "warn");
  setBox("hwStatus", "구간 소요시간 조회 중…", "loading"); showSkeletons("hwResults", 1);
  try {
    const d = await (await fetch(`/api/highway?op=traveltime&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)).json();
    if (d.needKey) { byId("hwResults").innerHTML = ""; return setBox("hwStatus", "⚠️ EX 인증키 설정 후 이용 가능합니다.", "warn"); }
    if (!d.ok) { setBox("hwStatus", d.message || "조회 실패", "warn"); return retryBox("hwResults", d.message || "조회 실패", searchTravelTime); }
    if (!d.found) return endEmpty("hwResults", "hwStatus", d.message || "해당 구간의 실시간 소요시간이 없습니다.", "warn");
    setBox("hwStatus", `${d.stdTime} 기준 실시간`, "ok");
    byId("hwResults").innerHTML = `<article class="card">
      <div class="card-top"><h3>🕐 ${E(d.startNm)} → ${E(d.endNm)}</h3><span class="bed ok">${d.timeAvg}분</span></div>
      <p class="meta">평균 <b>${d.timeAvg}분</b> · 최소 ${d.timeMin}분 · 최대 ${d.timeMax}분 <span class="opt">(승용차 기준)</span></p>
      <p class="meta">🔄 ${E(d.stdDate)} ${E(d.stdTime)} 기준 · 수분 단위 갱신</p>
    </article>`;
  } catch (e) { setBox("hwStatus", friendlyErr(e), "error"); retryBox("hwResults", e.message, searchTravelTime); }
}
async function searchHighway() {
  const mode = byId("hwMode").value;
  if (mode === "traveltime") return searchTravelTime();
  if (mode === "rest" && !byId("hwQ").value.trim()) return setBox("hwStatus", "휴게소명을 입력하세요.", "warn");
  setBox("hwStatus", "조회 중…", "loading"); showSkeletons("hwResults");
  try {
    const url = mode === "congest" ? "/api/highway?op=congest"
      : mode === "sms" ? "/api/highway?op=sms"
      : `/api/highway?op=rest&q=${encodeURIComponent(byId("hwQ").value.trim())}`;
    const d = await (await fetch(url)).json();
    if (d.needKey) { byId("hwResults").innerHTML = ""; return setBox("hwStatus", "⚠️ 고속도로 기능은 EX 인증키 설정 후 이용 가능합니다.", "warn"); }
    if (!d.ok) { setBox("hwStatus", d.message || "조회 실패", "warn"); return retryBox("hwResults", d.message || "조회 실패", searchHighway); }
    const rows = d.rows || [];
    if (!rows.length) return endEmpty("hwResults", "hwStatus",
      mode === "congest" ? "현재 정체/서행 구간이 없습니다. 원활합니다 🎉" : mode === "sms" ? "현재 진행 중인 돌발상황이 없습니다 🎉" : "일치하는 휴게소가 없습니다.",
      mode === "rest" ? "warn" : "ok");
    if (mode === "congest") {
      setBox("hwStatus", `현재 정체/서행 ${rows.length}구간`, "warn");
      byId("hwResults").innerHTML = rows.map(renderCongest).join("");
    } else if (mode === "sms") {
      setBox("hwStatus", `실시간 돌발·문자 ${rows.length}건 · ${kstClock()} 기준`, "ok");
      byId("hwResults").innerHTML = rows.map(renderHwSms).join("");
    } else {
      setBox("hwStatus", `휴게소 ${rows.length}곳`, "ok");
      byId("hwResults").innerHTML = rows.map(renderRestArea).join("");
    }
  } catch (e) { setBox("hwStatus", friendlyErr(e), "error"); retryBox("hwResults", e.message, searchHighway); }
}
function renderHwSms(r) {
  const acc = /사고|재난|낙하/.test(r.type), work = /공사|통제/.test(r.type), jam = /정체|서행/.test(r.type);
  const lvl = acc ? "full" : work ? "busy" : jam ? "warn" : "ok";
  const map = (Number.isFinite(r.lat) && Number.isFinite(r.lon))
    ? `<a class="btn map" href="https://map.kakao.com/link/map/${encodeURIComponent((r.route || "돌발") + " " + r.point)},${r.lat},${r.lon}" target="_blank" rel="noopener">🗺️ 지도</a>` : "";
  const meta = [r.routeNo ? `${r.route}(${r.routeNo})` : r.route, r.dir, r.point].filter(Boolean).map(E).join(" · ");
  const extra = [r.lateLength ? `정체 ${r.lateLength}km` : "", r.lanesClosed ? `${r.lanesClosed}개 차로 통제` : "", r.shoulder ? "갓길 통제" : "", r.process].filter(Boolean).map(E).join(" · ");
  return `<article class="card">
    <div class="card-top"><h3>🚨 ${E(r.type || "돌발")}</h3><span class="bed ${lvl}">${E(r.time || "")}</span></div>
    ${meta ? `<p class="meta">📍 ${meta}</p>` : ""}
    ${r.text ? `<p class="addr">${E(r.text)}</p>` : ""}
    ${extra ? `<p class="meta">${extra}</p>` : ""}
    ${map ? `<div class="card-actions">${map}</div>` : ""}
  </article>`;
}
function renderRestArea(r) {
  const fac = (r.facilities || []).map((f) => `<span class="chip">${E(f)}</span>`).join("");
  const foods = (r.foods || []).map((f) =>
    `<li class="meta">${f.recommend ? "⭐ " : f.best ? "🔥 " : ""}${E(f.name)}${f.cost ? ` · ${f.cost.toLocaleString()}원` : ""}</li>`).join("");
  const oil = r.oil && (r.oil.gasoline || r.oil.diesel)
    ? `<p class="meta">⛽ ${E(r.oil.company)} · ${r.oil.gasoline ? `휘발유 ${r.oil.gasoline.toLocaleString()}` : ""}${r.oil.diesel ? ` · 경유 ${r.oil.diesel.toLocaleString()}` : ""}원</p>` : "";
  return `<article class="card">
    <div class="card-top"><h3>🛣️ ${E(r.name)}</h3>${r.route ? `<span class="bed ok">${E(r.route)}</span>` : ""}</div>
    ${r.addr ? `<p class="addr">📍 ${E(r.addr)}</p>` : ""}
    ${fac ? `<div class="chips">${fac}</div>` : ""}
    ${foods ? `<p class="rt-label" style="margin-top:8px">🍜 대표·추천 메뉴</p><ul class="time-stats">${foods}</ul>` : ""}
    ${oil}
  </article>`;
}
function renderCongest(r) {
  const lvl = r.gradeCode >= 3 ? "full" : "busy";
  return `<article class="card busrow">
    <div class="card-top"><h3>${E(r.route)} <span class="opt">${E(r.zone)}</span></h3><span class="bed ${lvl}">${E(r.grade)}</span></div>
    <p class="meta">${r.updown ? E(r.updown) + " · " : ""}${r.speed != null ? `현재 ${r.speed}km/h` : ""}</p>
  </article>`;
}
byId("hwBtn").addEventListener("click", searchHighway);
byId("hwQ").addEventListener("keydown", (e) => { if (e.key === "Enter") searchHighway(); });
["ttStart", "ttEnd"].forEach((id) => {
  byId(id).addEventListener("keydown", (e) => { if (e.key === "Enter") searchTravelTime(); });
  byId(id).addEventListener("change", () => { if (byId("ttStart").value.trim() && byId("ttEnd").value.trim()) searchTravelTime(); });
});


// ==================== 🅿️ 주차장 ====================
// 전국 17,000여곳이 대상이라 서버가 페이지를 잘라 준다(거리순 정렬·필터 적용 후).
// 페이지 이동 때마다 위치를 다시 묻지 않도록 좌표를 캐시한다.
const wonNum = (v) => (v != null ? Number(v).toLocaleString() : "");
const PK_PAGE_SIZE = 12;
let pkCoords = null;

async function searchParking(page = 1) {
  try {
    // 새 검색이면 위치를 다시 확인하고, 페이지 이동이면 캐시된 좌표를 쓴다.
    const { lat, lon } = page === 1 || !pkCoords ? await getLocation("pkStatus", "pkAddr") : pkCoords;
    pkCoords = { lat, lon };
    const f = byId("pkFilter").value;
    setBox("pkStatus", "주차장 조회 중…", "loading"); showSkeletons("pkResults");
    const qs = new URLSearchParams({ lat, lon, page: String(page), size: String(PK_PAGE_SIZE) });
    if (f === "live") qs.set("live", "1");
    if (f === "free") qs.set("free", "1");
    const d = await (await fetch(`/api/parking?${qs}`)).json();
    if (d.needKey) return endEmpty("pkResults", "pkStatus", "⚠️ 주차장 기능은 SEOUL_API_KEY 설정 후 이용 가능합니다.", "warn");
    if (!d.ok) { clearPager("pkPager"); return endEmpty("pkResults", "pkStatus", d.error || d.message || "조회 실패", "warn"); }
    const rows = d.rows || [];
    if (!rows.length) { clearPager("pkPager"); return endEmpty("pkResults", "pkStatus", f ? "조건에 맞는 주차장이 없습니다." : "주변 주차장이 없습니다.", "warn"); }
    setBox("pkStatus", `조건에 맞는 ${d.matched.toLocaleString()}곳 · 실시간 제공 ${d.liveCount}곳 · ${kstClock()} 기준`, "ok");
    byId("pkResults").innerHTML = rows.map(renderParking).join("");
    if (window.GongMap) GongMap.set("parking", rows.map((p) => ({ lat: p.lat, lon: p.lon, label: p.name, sub: p.addr })), pkCoords);
    renderPager("pkPager", d.page, d.totalPages, (p) => { searchParking(p).then(() => scrollToResults("pkResults")); }, d.matched);
  } catch (e) { setBox("pkStatus", friendlyErr(e), "error"); retryBox("pkResults", e.message, () => searchParking(1)); }
}
function renderParking(p) {
  // 잔여 비율로 혼잡 표시
  let badge = `<span class="bed warn">총 ${p.capacity ?? "-"}면</span>`;
  if (p.available != null && p.capacity) {
    const ratio = p.available / p.capacity;
    const c = p.available === 0 ? "full" : ratio < 0.15 ? "busy" : "ok";
    badge = `<span class="bed ${c}">잔여 ${p.available} / ${p.capacity}</span>`;
  }
  const fee = p.free ? "무료"
    : p.rate != null && p.rateMin ? `${wonNum(p.rate)}원 / ${p.rateMin}분` + (p.addRate ? ` · 추가 ${wonNum(p.addRate)}원/${p.addMin}분` : "") : "요금 정보 없음";
  const hours = [p.wd ? `평일 ${p.wd}` : "", p.we ? `주말 ${p.we}` : ""].filter(Boolean).join(" · ");
  const tel = p.tel ? `<a class="btn tel" href="tel:${E(p.tel).replace(/[^0-9]/g, "")}">📞 ${E(p.tel)}</a>` : "";
  const map = `<a class="btn map" href="https://map.kakao.com/link/map/${encodeURIComponent(p.name)},${p.lat},${p.lon}" target="_blank" rel="noopener">🗺️ 지도</a>`;
  return `<article class="card">
    <div class="card-top"><h3>🅿️ ${E(p.name)}</h3>${badge}</div>
    <p class="addr">📍 ${E(p.addr)} · ${p.distance.toLocaleString()}m</p>
    <p class="meta">${[p.kind, p.oper].filter(Boolean).map(E).join(" · ")}</p>
    <p class="meta">💰 ${E(fee)}${p.dailyMax ? ` · 일 최대 ${wonNum(p.dailyMax)}원` : ""}</p>
    ${hours ? `<p class="meta">🕒 ${E(hours)}</p>` : ""}
    ${p.available != null ? `<p class="meta">🔄 실시간 · ${E(p.updatedAt)} 기준</p>` : ""}
    <div class="card-actions">${tel}${map}</div>
  </article>`;
}
// searchParking(page)는 첫 인자가 페이지 번호다. 리스너를 그대로 넘기면 Event 객체가 page로 들어간다.
byId("pkBtn").addEventListener("click", () => searchParking(1));
byId("pkFilter").addEventListener("change", () => { if (byId("pkResults").innerHTML) searchParking(1); });
byId("pkAddr").addEventListener("keydown", (e) => { if (e.key === "Enter") searchParking(1); });

// ==================== 📍 내 주변 통합 ====================
// 현재 위치 1회로 주유소·따릉이·버스·주차장을 병렬 조회해 근처 상위 3곳씩 한 화면에.
// 위치는 getLocation 캐시를 공유하므로 다른 위치탭에서 왔다면 권한 재요청이 없다.
const nbDist = (m) => (m != null ? `${Number(m).toLocaleString()}m` : "");
function nbGroup(icon, title, panel, items) {
  const body = items.length
    ? items.map((it) => `<li><span class="nb-name">${E(it.name)}</span><span class="nb-meta">${E(it.meta)}</span></li>`).join("")
    : `<li class="nb-empty">주변 결과가 없습니다.</li>`;
  return `<div class="nb-card">
    <div class="nb-head"><h3>${icon} ${E(title)}</h3><button type="button" class="linkbtn nb-more" data-panel="${panel}">전체 보기 →</button></div>
    <ul class="nb-list">${body}</ul>
  </div>`;
}
async function searchNearby() {
  try {
    const { lat, lon } = await getLocation("nbStatus", "nbAddr");
    setBox("nbStatus", "주변 정보를 모으는 중…", "loading");
    byId("nbResults").innerHTML = "";
    const jget = (u) => fetch(u).then((r) => r.json()).catch(() => ({}));
    const [gas, bike, pk] = await Promise.all([
      jget(`/api/gas?lat=${lat}&lon=${lon}&prodcd=B027&radius=2000`),
      jget(`/api/bike?lat=${lat}&lon=${lon}`),
      jget(`/api/parking?lat=${lat}&lon=${lon}&page=1&size=3`),
    ]);
    const gasItems = (gas.rows || []).slice(0, 3).map((s) => ({ name: s.name, meta: `${s.price ? s.price.toLocaleString() + "원/L" : "-"} · ${nbDist(s.distance)}` }));
    const bikeItems = (bike.rows || []).slice(0, 3).map((s) => ({ name: s.name, meta: `자전거 ${s.bikes}대 · ${nbDist(s.distance)}` }));
    const pkItems = (pk.rows || []).slice(0, 3).map((p) => ({ name: p.name, meta: `${p.available != null ? "잔여 " + p.available + " · " : ""}${nbDist(p.distance)}` }));
    const total = gasItems.length + bikeItems.length + pkItems.length;
    if (!total) return endEmpty("nbResults", "nbStatus", "주변 정보를 찾지 못했습니다. 주소를 입력해보세요.", "warn");
    setBox("nbStatus", `내 주변 요약 · ${kstClock()} 기준`, "ok");
    byId("nbResults").innerHTML =
      nbGroup("⛽", "주유소(휘발유 최저가)", "gas", gasItems) +
      nbGroup("🚲", "따릉이 대여소", "bike", bikeItems) +
      nbGroup("🅿️", "주차장", "parking", pkItems);
  } catch (e) { setBox("nbStatus", friendlyErr(e), "error"); retryBox("nbResults", e.message, searchNearby); }
}
byId("nbBtn").addEventListener("click", searchNearby);
byId("nbResults").addEventListener("click", (e) => {
  const b = e.target.closest(".nb-more");
  if (!b) return;
  // 내 주변에서 주소를 썼다면 해당 탭 주소칸에 넘겨준다(GPS면 캐시 공유로 그대로 조회)
  const addr = byId("nbAddr").value.trim();
  const addrTarget = { gas: "gasAddr", bike: "bikeAddr", parking: "pkAddr" }[b.dataset.panel];
  if (addr && addrTarget && byId(addrTarget)) byId(addrTarget).value = addr;
  switchPanel(b.dataset.panel);
});

// ==================== 🏥 야간진료 병의원 ====================
// s/e 배열 인덱스: [월,화,수,목,금,토,일,공휴일]. JS getDay(): 일0..토6.
const clDowIdx = () => (new Date().getDay() + 6) % 7;   // 월=0 … 일=6
const hhmm = (n) => { const v = String(n).padStart(4, "0"); return `${v.slice(0, 2)}:${v.slice(2)}`; };
function clOpenState(c) {
  const i = clDowIdx(), s = c.start[i], e = c.end[i];
  if (!s || !e) return { label: "오늘 휴무", cls: "full", open: false, closed: true };
  const now = new Date(); const cur = now.getHours() * 100 + now.getMinutes();
  const open = cur >= s && cur <= e;
  return { label: open ? "지금 진료중" : "진료마감", cls: open ? "ok" : "warn", open, closed: false, s, e };
}
// 진료과 문자열로 병의원 종류 분류 (일반의원/치과/한의원)
function clinicType(g) {
  const s = String(g || "");
  if (/한방|침구|사상체질|한의/.test(s)) return "han";
  if (/구강|치과/.test(s)) return "dental";
  return "general";
}
let clinicCache = { rows: [], center: null };
async function searchClinic() {
  try {
    const { lat, lon } = await getLocation("clStatus", "clAddr");
    setBox("clStatus", "야간진료 병의원 조회 중…", "loading"); showSkeletons("clResults");
    const radius = byId("clRadius").value || "2000";
    const d = await (await fetch(`/api/clinic?lat=${lat}&lon=${lon}&radius=${radius}&limit=60`)).json();
    if (d.needKey) return endEmpty("clResults", "clStatus", "⚠️ DATA_API_KEY 설정 후 이용 가능합니다.", "warn");
    if (!d.ok) { setBox("clStatus", d.error || "조회 실패", "warn"); return retryBox("clResults", d.error || "조회 실패", searchClinic); }
    clinicCache = { rows: d.rows || [], center: { lat, lon }, generatedAt: d.generatedAt, widened: d.widened };
    applyClinicFilter();
  } catch (e) { setBox("clStatus", friendlyErr(e), "error"); retryBox("clResults", e.message, searchClinic); }
}
function applyClinicFilter() {
  const { rows, center, generatedAt, widened } = clinicCache;
  if (!rows.length) return endEmpty("clResults", "clStatus", "주변에 야간진료 병의원 정보가 없습니다.", "warn");
  const onlyNow = byId("clOpen").value === "now";
  const type = byId("clType").value;
  const nightCut = Number(byId("clNight").value) || 1830;
  const iDay = clDowIdx();
  const TYPE_LABEL = { general: "일반의원", dental: "치과", han: "한의원", "": "" };
  const NIGHT_LABEL = { 1830: "6:30", 1900: "7시", 2000: "8시", 2100: "9시" }[nightCut] || "6:30";
  let list = rows.map((c) => ({ c, st: clOpenState(c) }));
  // 오늘 진료 종료가 야간 기준 이후인 곳만(=오늘 그 시각까지 진료). 오늘 휴무는 자동 제외.
  list = list.filter((x) => Number(x.c.end[iDay]) >= nightCut);
  if (type) list = list.filter((x) => clinicType(x.c.dgsbjt) === type);
  if (onlyNow) list = list.filter((x) => x.st.open);
  // 지금 진료중을 위로, 그다음 거리순
  list.sort((a, b) => (b.st.open - a.st.open) || (a.c.distance - b.c.distance));
  if (!list.length) return endEmpty("clResults", "clStatus", `오후 ${NIGHT_LABEL} 이후까지 하는 ${TYPE_LABEL[type] || "병의원"}이 주변에 없습니다. 야간 기준·반경·종류를 넓혀보세요.`, "warn");
  const openCnt = list.filter((x) => x.st.open).length;
  setBox("clStatus", `${TYPE_LABEL[type] ? TYPE_LABEL[type] + " " : ""}${list.length}곳 · 오후 ${NIGHT_LABEL}↑${onlyNow ? "" : ` · 지금 진료중 ${openCnt}곳`}${widened ? " · 반경 밖 최근접" : ""} · ${kstClock()} 기준`, "ok");
  byId("clResults").innerHTML = list.map(({ c, st }) => {
    const i = clDowIdx();
    const today = st.closed ? "오늘 휴무" : `오늘 ${hhmm(c.start[i])}~${hhmm(c.end[i])}`;
    const tel = c.tel ? `<a class="btn tel" href="tel:${E(c.tel)}">📞 전화</a>` : "";
    const map = `<a class="btn map" href="https://map.kakao.com/link/map/${encodeURIComponent(c.name)},${c.lat},${c.lon}" target="_blank" rel="noopener">🗺️ 지도</a>`;
    const dg = (c.dgsbjt || "").split(",").slice(0, 4).join(", ");
    return `<article class="card">
      <div class="card-top"><h3>🏥 ${E(c.name)}</h3><span class="bed ${st.cls}">${st.label}</span></div>
      <p class="meta">🕐 ${E(today)} · 📍 ${c.distance.toLocaleString()}m</p>
      ${dg ? `<p class="meta">${E(dg)}</p>` : ""}
      <p class="addr">📍 ${E(c.addr)}</p>
      <div class="card-actions">${tel}${map}</div>
    </article>`;
  }).join("");
  if (window.GongMap) GongMap.set("clinic", list.map(({ c }) => ({ lat: c.lat, lon: c.lon, label: c.name, sub: c.tel || "" })), center);
  if (generatedAt) byId("clResults").insertAdjacentHTML("beforeend", `<p class="hint" style="grid-column:1/-1">ℹ️ 진료시간은 변동될 수 있습니다. ${E(generatedAt)} 기준 데이터 · 방문 전 전화 확인 권장.</p>`);
}
byId("clBtn").addEventListener("click", searchClinic);
// 종류·야간기준·지금진료중은 클라이언트 재필터, 반경은 서버 재조회
byId("clOpen").addEventListener("change", () => { if (clinicCache.rows.length) applyClinicFilter(); });
byId("clType").addEventListener("change", () => { if (clinicCache.rows.length) applyClinicFilter(); });
byId("clNight").addEventListener("change", () => { if (clinicCache.rows.length) applyClinicFilter(); });
byId("clRadius").addEventListener("change", () => { if (clinicCache.rows.length) searchClinic(); });

// ==================== 💊 문 연 약국 ====================
// /api/pharmacy 가 거리순 + 오늘 영업시간(start/end, HHMM)을 주므로 '지금 열림'은 프론트 계산.
function phOpenState(p) {
  if (p.start == null || p.end == null) return { label: "시간 정보 없음", cls: "warn", open: false, unknown: true };
  const now = new Date(); const cur = now.getHours() * 100 + now.getMinutes();
  // 자정 넘겨 여는 곳(end<start)은 or 조건으로 판정
  const open = p.end >= p.start ? (cur >= p.start && cur <= p.end) : (cur >= p.start || cur <= p.end);
  return { label: open ? "지금 열림" : "영업마감", cls: open ? "ok" : "warn", open };
}
let pharmCache = { rows: [], center: null };
async function searchPharmacy() {
  try {
    const { lat, lon } = await getLocation("phStatus", "phAddr");
    setBox("phStatus", "주변 약국 조회 중…", "loading"); showSkeletons("phResults");
    const d = await (await fetch(`/api/pharmacy?lat=${lat}&lon=${lon}&limit=40`)).json();
    if (d.needKey) return endEmpty("phResults", "phStatus", "⚠️ DATA_API_KEY 설정 후 이용 가능합니다.", "warn");
    if (!d.ok) { setBox("phStatus", d.error || "조회 실패", "warn"); return retryBox("phResults", d.error || "조회 실패", searchPharmacy); }
    pharmCache = { rows: d.rows || [], center: { lat, lon } };
    applyPharmacyFilter();
  } catch (e) { setBox("phStatus", friendlyErr(e), "error"); retryBox("phResults", e.message, searchPharmacy); }
}
function applyPharmacyFilter() {
  const { rows, center } = pharmCache;
  if (!rows.length) return endEmpty("phResults", "phStatus", "주변에 약국 정보가 없습니다. 주소를 입력해보세요.", "warn");
  const onlyNow = byId("phOpen").value === "now";
  let list = rows.map((p) => ({ p, st: phOpenState(p) }));
  if (onlyNow) list = list.filter((x) => x.st.open);
  list.sort((a, b) => (b.st.open - a.st.open) || (a.p.distance - b.p.distance));
  if (!list.length) return endEmpty("phResults", "phStatus", "지금 열려 있는 약국이 주변에 없습니다. '전체'로 보면 가까운 약국은 나옵니다.", "warn");
  const openCnt = list.filter((x) => x.st.open).length;
  setBox("phStatus", `약국 ${list.length}곳${onlyNow ? "" : ` · 지금 열림 ${openCnt}곳`} · ${kstClock()} 기준`, "ok");
  byId("phResults").innerHTML = list.map(({ p, st }) => {
    const hours = st.unknown ? "영업시간 정보 없음" : `오늘 ${hhmm(p.start)}~${hhmm(p.end)}`;
    const tel = p.tel ? `<a class="btn tel" href="tel:${E(String(p.tel).replace(/[^0-9]/g, ""))}">📞 전화</a>` : "";
    const map = `<a class="btn map" href="https://map.kakao.com/link/map/${encodeURIComponent(p.name)},${p.lat},${p.lon}" target="_blank" rel="noopener">🗺️ 지도</a>`;
    return `<article class="card">
      <div class="card-top"><h3>💊 ${E(p.name)}</h3><span class="bed ${st.cls}">${st.label}</span></div>
      <p class="meta">🕐 ${E(hours)} · 📍 ${p.distance.toLocaleString()}m</p>
      <p class="addr">📍 ${E(p.addr)}</p>
      <div class="card-actions">${tel}${map}</div>
    </article>`;
  }).join("");
  if (window.GongMap) GongMap.set("pharmacy", list.map(({ p }) => ({ lat: p.lat, lon: p.lon, label: p.name, sub: p.tel || "" })), center);
  byId("phResults").insertAdjacentHTML("beforeend", `<p class="hint" style="grid-column:1/-1">ℹ️ 영업시간은 변동될 수 있어요. 방문 전 전화로 확인하세요.</p>`);
}
byId("phBtn").addEventListener("click", searchPharmacy);
byId("phOpen").addEventListener("change", () => { if (pharmCache.rows.length) applyPharmacyFilter(); });

// ==================== 🚑 응급실 실시간 ====================
// hvidate: YYYYMMDDHHmmss → HH:MM
const fmtErTime = (s) => { const v = String(s || ""); return v.length >= 12 ? `${v.slice(8, 10)}:${v.slice(10, 12)}` : ""; };
function erBedState(beds) {
  if (beds == null) return { txt: "실시간 미제공", cls: "warn", free: false };
  if (beds <= 0) return { txt: `포화 (${beds})`, cls: "full", free: false };       // 음수·0 = 정원 초과/만석
  if (beds <= 2) return { txt: `가용 ${beds}`, cls: "busy", free: true };
  return { txt: `가용 ${beds}`, cls: "ok", free: true };
}
let erCache = { rows: [], center: null };
async function searchEmergency() {
  try {
    const { lat, lon } = await getLocation("emStatus", "emAddr");
    setBox("emStatus", "주변 응급실 실시간 조회 중…", "loading"); showSkeletons("emResults");
    const d = await (await fetch(`/api/emergency?lat=${lat}&lon=${lon}&limit=15`)).json();
    if (d.needKey) return endEmpty("emResults", "emStatus", "⚠️ DATA_API_KEY 설정 후 이용 가능합니다.", "warn");
    if (!d.ok) { setBox("emStatus", d.error || "조회 실패", "warn"); return retryBox("emResults", d.error || "조회 실패", searchEmergency); }
    erCache = { rows: d.rows || [], center: { lat, lon } };
    applyEmergencyFilter();
  } catch (e) { setBox("emStatus", friendlyErr(e), "error"); retryBox("emResults", e.message, searchEmergency); }
}
function applyEmergencyFilter() {
  const { rows, center } = erCache;
  if (!rows.length) return endEmpty("emResults", "emStatus", "주변에 응급실 정보가 없습니다. 주소를 입력해보세요.", "warn");
  const onlyFree = byId("emFilter").value === "free";
  let list = rows.map((e) => ({ e, bs: erBedState(e.beds) }));
  if (onlyFree) list = list.filter((x) => x.bs.free);
  // 거리순 유지(응급 상황엔 근접이 우선). 실시간 있는 곳이 위로 오도록 살짝 가중.
  if (!list.length) return endEmpty("emResults", "emStatus", "병상 여유가 있는 응급실이 주변에 없습니다. '전체'로 보고 전화로 확인하세요.", "warn");
  const freeCnt = list.filter((x) => x.bs.free).length;
  const latest = rows.map((e) => e.updatedAt).filter(Boolean).sort().slice(-1)[0];
  setBox("emStatus", `응급실 ${list.length}곳 · 병상 여유 ${freeCnt}곳${latest ? ` · ${fmtErTime(latest)} 갱신` : ""}`, "ok");
  byId("emResults").innerHTML = list.map(({ e, bs }) => {
    const eq = [e.ct ? "CT" : "", e.mri ? "MRI" : "", e.venti ? "인공호흡기" : ""].filter(Boolean);
    const tel = e.tel ? `<a class="btn tel" href="tel:${E(String(e.tel).replace(/[^0-9]/g, ""))}">📞 전화</a>` : "";
    const map = (e.lat && e.lon) ? `<a class="btn map" href="https://map.kakao.com/link/map/${encodeURIComponent(e.name)},${e.lat},${e.lon}" target="_blank" rel="noopener">🗺️ 지도</a>` : "";
    return `<article class="card">
      <div class="card-top"><h3>🚑 ${E(e.name)}</h3><span class="bed ${bs.cls}">${E(bs.txt)}</span></div>
      <p class="meta">📍 ${e.distance ? e.distance.toLocaleString() + "m" : ""}${e.updatedAt ? ` · 🔄 ${fmtErTime(e.updatedAt)} 기준` : ""}</p>
      ${eq.length ? `<p class="meta">🩺 ${eq.map(E).join(" · ")} 가용</p>` : ""}
      <p class="addr">📍 ${E(e.addr)}</p>
      <div class="card-actions">${tel}${map}</div>
    </article>`;
  }).join("");
  if (window.GongMap) GongMap.set("emergency", list.map(({ e }) => ({ lat: e.lat, lon: e.lon, label: e.name, sub: e.beds != null ? `병상 ${e.beds}` : "" })), center);
  byId("emResults").insertAdjacentHTML("beforeend", `<p class="hint" style="grid-column:1/-1">⚠️ 실시간 병상은 참고용입니다. 이송 전 반드시 전화로 수용 가능 여부를 확인하세요. 위급하면 119.</p>`);
}
byId("emBtn").addEventListener("click", searchEmergency);
byId("emFilter").addEventListener("change", () => { if (erCache.rows.length) applyEmergencyFilter(); });

// ---------- 입력창 지우기(×) 버튼 ----------
// 주요 텍스트 입력에 clear 버튼을 주입(모바일에서 긴 주소·역명 재입력 마찰 감소).
(function initClearButtons() {
  const ids = ["gasAddr", "bikeAddr", "cbAddr", "pkAddr", "nbAddr", "clAddr", "phAddr", "emAddr", "densQ", "airQ", "reApt", "lhName", "hwQ", "lottoMine"];
  ids.forEach((id) => {
    const el = byId(id);
    if (!el || el.dataset.clearable) return;
    el.dataset.clearable = "1";
    const wrap = document.createElement("span");
    wrap.className = "input-clear-wrap";
    el.parentNode.insertBefore(wrap, el);
    wrap.appendChild(el);
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "input-clear"; btn.setAttribute("aria-label", "입력 지우기"); btn.textContent = "✕"; btn.hidden = !el.value;
    wrap.appendChild(btn);
    el.addEventListener("input", () => { btn.hidden = !el.value; });
    btn.addEventListener("click", () => { el.value = ""; btn.hidden = true; el.focus(); el.dispatchEvent(new Event("input", { bubbles: true })); });
  });
})();

// ---------- 실시간 탭 새로고침 버튼 ----------
// 지하철 도착·혼잡도·따릉이·주차장은 "실시간"인데 한 번 조회하면 값이 굳는다.
// 조건을 다시 건드리지 않고도 최신화할 수 있게 결과 위에 🔄 버튼을 붙인다.
(function initRealtimeRefresh() {
  const RT = [
    { resultsId: "densResults", btnId: "densBtn", run: () => searchDensity() },
    { resultsId: "bikeResults", btnId: "bikeBtn", run: () => searchBike() },
    { resultsId: "pkResults",   btnId: "pkBtn",   run: () => searchParking(1) },
    { resultsId: "hwResults",   btnId: "hwBtn",   run: () => searchHighway() },
  ];
  RT.forEach(({ resultsId, btnId, run }) => {
    const results = byId(resultsId), mainBtn = byId(btnId);
    if (!results || !mainBtn) return;
    const bar = document.createElement("div");
    bar.className = "refresh-bar";
    bar.innerHTML = `<button type="button" class="refresh-btn" hidden>🔄 새로고침</button>`;
    results.parentNode.insertBefore(bar, results);
    const btn = bar.querySelector(".refresh-btn");
    mainBtn.addEventListener("click", () => { btn.hidden = false; });   // 검색을 시작하면 노출
    btn.addEventListener("click", run);
  });
})();

// ---------- 초기값 ----------
(function initServices() {
  syncHwMode();
  renderHub();        // 홈 허브 카드(살아 있는 탭 전부)를 먼저 만들고
  applyHashPanel();   // #parking 등으로 들어온 경우 해당 탭을 연다(없으면 홈 유지)
})();
