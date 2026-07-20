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

// ---------- 상단 내비: 카테고리(교통·주거·생활) → 서브탭 ----------
// 탭을 location.hash에 반영해 새로고침 복원·링크 공유가 되게 한다(#parking 등).
const toptabEls = () => [...document.querySelectorAll(".toptab")];
const panelNames = () => toptabEls().map((b) => b.dataset.panel);
const catOf = (name) => document.querySelector(`.toptab[data-panel="${name}"]`)?.dataset.cat || null;
const firstTabOfCat = (cat) => document.querySelector(`.toptab[data-cat="${cat}"]`)?.dataset.panel || null;

// 카테고리 바만 갱신하고 그 안의 서브탭만 보이게 한다(패널 전환 없이).
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
  const cat = catOf(name);
  if (cat) showCategory(cat);
  toptabEls().forEach((b) => {
    const on = b.dataset.panel === name;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === `panel-${name}`));
  if (updateHash && location.hash.slice(1) !== name) history.replaceState(null, "", `#${name}`);
  if (name === "gas") { loadGasAvg(); loadGasTrend(); }
}

// 카테고리 클릭 → 그 카테고리의 첫 서브탭으로 이동
document.querySelectorAll(".cattab").forEach((c) =>
  c.addEventListener("click", () => { const t = firstTabOfCat(c.dataset.cat); if (t) switchPanel(t); }));

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
function retryBox(resultsId, msg, retryFn) {
  if (window.GongMap) GongMap.clearByResults(resultsId);   // 오류 시 이전 지도 핀/토글 제거
  const timeout = /시간 초과|timeout|Failed to fetch|network/i.test(msg);
  byId(resultsId).innerHTML =
    `<div class="retry-box"><div class="retry-ico">${timeout ? "⏱️" : "⚠️"}</div>
      <p class="retry-msg">${E(timeout ? "서버 응답이 지연되고 있습니다." : msg)}</p>
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
  } catch (e) { setBox("densStatus", `오류: ${e.message}`, "error"); retryBox("densResults", e.message, searchDensity); }
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

// ==================== 🧳 지하철 분실물 (안내형) ====================
const LOST112 = "https://www.lost112.go.kr/find/findList.do";
const SEOULMETRO_LOST = "https://www.seoulmetro.co.kr/kr/page.do?menuIdx=541";
function searchLost() {
  const stn = byId("lostStn").value.trim();
  const item = byId("lostItem").value.trim();
  const days = Number(byId("lostDays").value || 14);
  const end = new Date(Date.now() + 9 * 3600e3);
  const start = new Date(end.getTime() - days * 864e5);
  const f = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  setBox("lostStatus", "공식 조회 조건을 정리했습니다.", "ok");
  byId("lostResults").innerHTML = `
    <article class="card">
      <h3>🧳 유실물 조회 조건</h3>
      <table class="lost-table">
        <tr><td>기관 구분</td><td>지하철·공항 등 (SITE=V)</td></tr>
        <tr><td>보관장소/역명</td><td>${E(stn || "(미입력 — 전체)")}</td></tr>
        <tr><td>물품명</td><td>${E(item || "(미입력 — 전체)")}</td></tr>
        <tr><td>검색 기간</td><td>${f(start)} ~ ${f(end)} (최근 ${days}일)</td></tr>
      </table>
      <p class="meta">공개 자동조회 API가 확정되지 않아, 아래 공식 창구에서 위 조건으로 검색하세요. 역명으로 결과가 없으면 <strong>‘역’ 없이</strong> 또는 <strong>호선명</strong>으로 넓혀보세요.</p>
      <div class="card-actions">
        <a class="btn map" href="${LOST112}" target="_blank" rel="noopener">🔎 LOST112 유실물 검색</a>
        <a class="btn tel" href="${SEOULMETRO_LOST}" target="_blank" rel="noopener">🚇 서울교통공사 유실물센터</a>
      </div>
    </article>
    <article class="card">
      <h3>📌 이용 순서</h3>
      <ol class="lost-steps">
        <li>LOST112에서 <strong>습득물 검색</strong> → 보관장소에 역명, 물품명 입력, 기간 지정</li>
        <li>결과가 없으면 키워드를 넓히거나(역 제거) 호선명으로 재검색</li>
        <li>본인 물품으로 보이면 보관 기관(역/센터)에 연락해 수령 절차 확인</li>
        <li>지하철은 <strong>서울교통공사 유실물센터</strong>에서 호선별 보관소·연락처 확인</li>
      </ol>
    </article>`;
}
byId("lostBtn").addEventListener("click", searchLost);

// ==================== 🎰 로또 ====================
function lottoBallColor(n) {
  if (n <= 10) return "#fbc400"; if (n <= 20) return "#69c8f2";
  if (n <= 30) return "#ff7272"; if (n <= 40) return "#aaa"; return "#b0d840";
}
const lottoBall = (n, bonus = false) => `<span class="lotto-ball${bonus ? " bonus" : ""}" style="background:${lottoBallColor(n)}">${n}</span>`;
const won = (v) => Number(v || 0).toLocaleString() + "원";
function parseMyNumbers(s) {
  return [...new Set((s.match(/\d+/g) || []).map(Number).filter((n) => n >= 1 && n <= 45))];
}
function lottoRank(matchCount, bonusHit) {
  if (matchCount === 6) return 1;
  if (matchCount === 5 && bonusHit) return 2;
  if (matchCount === 5) return 3;
  if (matchCount === 4) return 4;
  if (matchCount === 3) return 5;
  return 0;
}
async function searchLotto() {
  const round = byId("lottoRound").value.trim();
  const mine = parseMyNumbers(byId("lottoMine").value);
  if (byId("lottoMine").value.trim() && mine.length !== 6)
    return setBox("lottoStatus", "내 번호는 1~45 사이 서로 다른 6개를 입력하세요.", "warn");
  setBox("lottoStatus", "조회 중…", "loading"); showSkeletons("lottoResults", 2);
  try {
    const r = await fetch(`/api/lotto?round=${encodeURIComponent(round || "latest")}`);
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
    setBox("lottoStatus", `${d.round}회 (${d.date})`, "ok");
    const nums = (d.numbers || []).slice().sort((a, b) => a - b);
    let mineBlock = "";
    if (mine.length === 6) {
      const set = new Set(nums);
      const hit = mine.filter((n) => set.has(n));
      const bonusHit = mine.includes(d.bonus);
      const rank = lottoRank(hit.length, bonusHit);
      mineBlock = `
        <article class="card">
          <div class="card-top"><h3>내 번호 결과</h3>
            <span class="bed ${rank && rank <= 3 ? "ok" : rank ? "warn" : "full"}">${rank ? rank + "등" : "미당첨"}</span></div>
          <div class="lotto-balls">${mine.sort((a, b) => a - b).map((n) => lottoBall(n)).join("")}</div>
          <p class="meta">일치 ${hit.length}개${bonusHit ? " + 보너스" : ""}${hit.length ? " (" + hit.sort((a, b) => a - b).join(", ") + ")" : ""}</p>
        </article>`;
    }
    const divs = (d.divisions || []).map((x) =>
      `<li class="meta">${x.rank}등 · ${won(x.prize)} · ${Number(x.winners || 0).toLocaleString()}명</li>`).join("");
    byId("lottoResults").innerHTML = `
      <article class="card">
        <div class="card-top"><h3>🎰 ${d.round}회 당첨번호</h3><span class="bed ok">${E(d.date)}</span></div>
        <div class="lotto-balls">${nums.map((n) => lottoBall(n)).join("")}<span class="lotto-plus">+</span>${lottoBall(d.bonus, true)}</div>
        <ul class="stats-list">${divs}</ul>
        ${d.totalSales ? `<p class="meta">총 판매액 ${won(d.totalSales)}</p>` : ""}
      </article>` + mineBlock;
  } catch (e) { setBox("lottoStatus", `오류: ${e.message}`, "error"); retryBox("lottoResults", e.message, searchLotto); }
}
byId("lottoBtn").addEventListener("click", searchLotto);
// 🎲 자동생성 — 1~45 무작위 6개(중복 없이)
byId("lottoGen").addEventListener("click", () => {
  const set = new Set();
  while (set.size < 6) set.add(Math.floor(Math.random() * 45) + 1);
  byId("lottoMine").value = [...set].sort((a, b) => a - b).join(", ");
});
byId("lottoRound").addEventListener("keydown", (e) => { if (e.key === "Enter") searchLotto(); });
byId("lottoMine").addEventListener("keydown", (e) => { if (e.key === "Enter") searchLotto(); });

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
  } catch (e) { setBox("gasStatus", `오류: ${e.message}`, "error"); retryBox("gasResults", e.message, searchGas); }
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
  } catch (e) { setBox("bikeStatus", `오류: ${e.message}`, "error"); retryBox("bikeResults", e.message, searchBike); }
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
  } catch (e) { setBox("hwStatus", `오류: ${e.message}`, "error"); retryBox("hwResults", e.message, searchTravelTime); }
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
  } catch (e) { setBox("hwStatus", `오류: ${e.message}`, "error"); retryBox("hwResults", e.message, searchHighway); }
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

// ==================== 🏠 아파트 실거래가 ====================
// 시군구 법정동코드(LAWD_CD, 5자리) — 서울 25구 + 주요 광역/경기
//
// ⚠️ 행정구역 개편으로 코드가 바뀐다. RTMS는 과거 거래까지 새 코드로 재색인하므로
//    옛 코드를 쓰면 resultCode=000 / totalCount=0 (오류가 아니라 "거래 없음"처럼 보인다).
//    아래 코드는 전부 RTMS에 직접 조회해 응답 건수를 확인한 값이다.
//      · 부천시 41190 → 원미/소사/오정구 (구 부활)
//      · 화성시 41590 → 만세/효행/병점/동탄구 (2026-02-01 4개 구 신설)
//      · 인천 서구 28260 → 서해구 28275 · 검단구 28290 (2026-07-01 분구)
//      · 전남광주통합특별시(2026-07-01): 시도 프리픽스가 29(광주)·46(전남) → "12"로 통합.
//        시·구·군 순 재배열 — 목포 12110 / 여수 12130 / 순천 12150 / 나주 12170 / 광양 12190,
//        광주 동구 12210 / 서구 12240 / 남구 12270 / 북구 12300 / 광산구 12330.
//        (2026-07-16 RTMS 실조회로 동 이름까지 대조 확인. 옛 46110 목포도 0건 = 46 전체 폐기)
const LAWD = {
  "서울": { "종로구": "11110", "중구": "11140", "용산구": "11170", "성동구": "11200", "광진구": "11215", "동대문구": "11230", "중랑구": "11260", "성북구": "11290", "강북구": "11305", "도봉구": "11320", "노원구": "11350", "은평구": "11380", "서대문구": "11410", "마포구": "11440", "양천구": "11470", "강서구": "11500", "구로구": "11530", "금천구": "11545", "영등포구": "11560", "동작구": "11590", "관악구": "11620", "서초구": "11650", "강남구": "11680", "송파구": "11710", "강동구": "11740" },
  "경기": { "수원 영통구": "41117", "수원 팔달구": "41115", "성남 분당구": "41135", "성남 수정구": "41131", "용인 수지구": "41465", "용인 기흥구": "41463", "고양 일산동구": "41285", "부천 원미구": "41192", "부천 소사구": "41194", "부천 오정구": "41196", "안양 동안구": "41173", "화성 만세구": "41591", "화성 효행구": "41593", "화성 병점구": "41595", "화성 동탄구": "41597", "김포시": "41570", "하남시": "41450", "남양주시": "41360", "광명시": "41210", "의정부시": "41150" },
  "인천": { "연수구": "28185", "남동구": "28200", "서해구": "28275", "검단구": "28290", "계양구": "28245", "부평구": "28237" },
  "부산": { "해운대구": "26350", "수영구": "26500", "동래구": "26260", "부산진구": "26230" },
  "대구": { "수성구": "27260", "달서구": "27290" }, "대전": { "유성구": "30200", "서구": "30170" },
  "광주": { "동구": "12210", "서구": "12240", "남구": "12270", "북구": "12300", "광산구": "12330" },
  "전남": { "목포시": "12110", "여수시": "12130", "순천시": "12150", "나주시": "12170", "광양시": "12190" },
};
function initRealEstate() {
  const sel = byId("reRegion");
  sel.innerHTML = Object.entries(LAWD).map(([sido, gus]) =>
    `<optgroup label="${sido}">${Object.entries(gus).map(([nm, cd]) => `<option value="${cd}">${sido} ${E(nm)}</option>`).join("")}</optgroup>`).join("");
  sel.value = "11680"; // 강남구 기본
  const d = new Date(Date.now() + 9 * 3600e3); d.setUTCMonth(d.getUTCMonth() - 1); // 지난달
  byId("reYm").value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
// UI 유형(매매/전세/월세/분양권) → API 유형(trade/rent/silv) + 임대 종류
const RE_UI = { trade: { api: "trade" }, jeonse: { api: "rent", kind: "전세" }, wolse: { api: "rent", kind: "월세" }, silv: { api: "silv" } };
const RE_LABEL = { trade: "매매", jeonse: "전세", wolse: "월세", silv: "분양권" };
let reCache = { rows: [], uiType: "trade", regionName: "" };
// 서버가 전량(전 페이지)을 주므로 필터·정렬·페이지네이션은 전체 집합 위에서 클라이언트가 처리한다.
const RE_PAGE_SIZE = 20;
let rePage = 1;

function syncReType() {
  const t = byId("reType").value;
  byId("panel-realestate").querySelector(".wolse-only").style.display = t === "wolse" ? "" : "none";
  byId("rePriceUnit").textContent = t === "trade" || t === "silv" ? "(억·매매가)" : "(억·보증금)";
}
byId("reType").addEventListener("change", syncReType);

async function searchRealEstate() {
  const uiType = byId("reType").value, lawd = byId("reRegion").value, ym = (byId("reYm").value || "").replace("-", "");
  if (!/^\d{6}$/.test(ym)) return setBox("reStatus", "거래연월을 선택하세요.", "warn");
  setBox("reStatus", "조회 중…", "loading"); showSkeletons("reResults"); clearPager("rePager");
  // 새 검색이면 랭킹·추이 도구를 초기화(이전 지역 결과 잔존 방지)
  byId("reInsights").hidden = true; byId("reInsightsOut").innerHTML = ""; reRankOpen = false; reTrendOpen = false;
  byId("reRankBtn").classList.remove("on"); byId("reTrendBtn").classList.remove("on");
  try {
    const d = await (await fetch(`/api/realestate?type=${RE_UI[uiType].api}&lawd=${lawd}&ym=${ym}`)).json();
    if (d.needKey) return endEmpty("reResults", "reStatus", "⚠️ 실거래가 기능은 DATA_API_KEY 설정 후 이용 가능합니다.", "warn");
    if (!d.ok) return endEmpty("reResults", "reStatus", d.error || "조회 실패", "warn");
    const sel = byId("reRegion");
    reCache = { rows: d.rows || [], uiType, regionName: sel.options[sel.selectedIndex]?.text || "", truncated: d.truncated, failedPages: d.failedPages };
    if (!reCache.rows.length) return endEmpty("reResults", "reStatus", "해당 지역·연월에 신고된 거래가 없습니다.", "warn");
    rePage = 1;
    applyReFilter();
  } catch (e) { setBox("reStatus", `오류: ${e.message}`, "error"); retryBox("reResults", e.message, searchRealEstate); }
}
// 수집 누락·절단을 조용히 넘기지 않는다.
function collectWarning(d) {
  const parts = [];
  if (d.truncated) parts.push("상한 초과로 일부만 수집");
  if (d.failedPages?.length) parts.push(`페이지 ${d.failedPages.join(",")} 수집 실패`);
  return parts.length ? ` ⚠️ ${parts.join(" · ")}` : "";
}

// 카드 정렬·필터용 대표 금액(만원): 매매/분양권=거래액, 전세/월세=보증금
const rePrice = (uiType, r) => (uiType === "trade" || uiType === "silv" ? r.amount : r.deposit) || 0;

function applyReFilter() {
  const { rows, uiType } = reCache;
  if (!rows.length) return;
  const kind = RE_UI[uiType].kind;
  const min = parseFloat(byId("reMin").value), max = parseFloat(byId("reMax").value);
  const monMax = parseFloat(byId("reMonMax").value);
  const sort = byId("reSort").value;

  let out = rows.slice();
  if (kind) out = out.filter((r) => r.kind === kind);                        // 전세 / 월세 분리
  const aptQ = byId("reApt").value.trim().replace(/\s+/g, "");
  if (aptQ) out = out.filter((r) => String(r.apt || "").replace(/\s+/g, "").includes(aptQ));   // 단지명 부분일치
  if (Number.isFinite(min)) out = out.filter((r) => rePrice(uiType, r) >= min * 10000);
  if (Number.isFinite(max)) out = out.filter((r) => rePrice(uiType, r) <= max * 10000);
  if (uiType === "wolse" && Number.isFinite(monMax)) out = out.filter((r) => (r.monthly || 0) <= monMax);

  if (sort === "high") out.sort((a, b) => rePrice(uiType, b) - rePrice(uiType, a));
  else if (sort === "low") out.sort((a, b) => rePrice(uiType, a) - rePrice(uiType, b));
  else out.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));

  if (!out.length) { clearPager("rePager"); return endEmpty("reResults", "reStatus", `조건에 맞는 거래가 없습니다. (전체 ${rows.length}건)`, "warn"); }

  const totalPages = Math.max(Math.ceil(out.length / RE_PAGE_SIZE), 1);
  if (rePage > totalPages) rePage = totalPages;   // 필터가 좁아져 현재 페이지가 사라진 경우
  const slice = out.slice((rePage - 1) * RE_PAGE_SIZE, rePage * RE_PAGE_SIZE);

  setBox("reStatus", `${out.length.toLocaleString()}건 중 ${slice.length}건 표시 · 전체 ${rows.length.toLocaleString()}건${collectWarning(reCache)}`, "ok");
  byId("reResults").innerHTML = slice.map((r) => renderRealEstate(uiType, r)).join("");
  renderPager("rePager", rePage, totalPages, (p) => { rePage = p; applyReFilter(); scrollToResults("reResults"); }, out.length);
  byId("reInsights").hidden = false;   // 검색 성공 → 랭킹·추이 도구 노출
}

// ---- 🏆 이번 달 랭킹 (현재 로드된 데이터 집계, 신규 API 불필요) ----
let reRankOpen = false;
function renderReRanking() {
  const out = byId("reInsightsOut");
  reRankOpen = !reRankOpen;
  byId("reTrendBtn").classList.remove("on");
  if (!reRankOpen) { out.innerHTML = ""; return; }
  byId("reRankBtn").classList.add("on");
  const { rows, uiType } = reCache;
  const kind = RE_UI[uiType].kind;
  const base = (kind ? rows.filter((r) => r.kind === kind) : rows).filter((r) => rePrice(uiType, r) > 0);
  if (!base.length) { out.innerHTML = `<div class="empty-state"><p>집계할 거래가 없습니다.</p></div>`; return; }
  const topPrice = base.slice().sort((a, b) => rePrice(uiType, b) - rePrice(uiType, a)).slice(0, 8);
  const cnt = {};
  base.forEach((r) => { const k = r.apt || "-"; cnt[k] = (cnt[k] || 0) + 1; });
  const topCnt = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 8);
  out.innerHTML = `<div class="rank-wrap">
    <div class="rank-col"><h4>💰 최고가 TOP</h4><ol class="rank-list">${topPrice.map((r) => `<li><span>${E(r.apt)} <span class="opt">${E(r.dong || "")}</span></span><b>${E(eok(rePrice(uiType, r)))}${uiType === "trade" || uiType === "silv" ? "원" : ""}</b></li>`).join("")}</ol></div>
    <div class="rank-col"><h4>🔥 거래량 TOP</h4><ol class="rank-list">${topCnt.map(([nm, c]) => `<li><span>${E(nm)}</span><b>${c}건</b></li>`).join("")}</ol></div>
  </div><p class="hint">${E(reCache.regionName)} · ${RE_LABEL[uiType] || uiType} · ${byId("reYm").value} 신고분 ${base.length.toLocaleString()}건 기준</p>`;
}

// ---- 📈 시세 추이 (최근 6개월 반복 조회 → 월별 평균·건수 SVG) ----
let reTrendOpen = false;
async function loadReTrend() {
  const out = byId("reInsightsOut");
  reTrendOpen = !reTrendOpen;
  byId("reRankBtn").classList.remove("on");
  if (!reTrendOpen) { out.innerHTML = ""; return; }
  byId("reTrendBtn").classList.add("on");
  const uiType = reCache.uiType, lawd = byId("reRegion").value;
  const apiType = RE_UI[uiType].api, kind = RE_UI[uiType].kind;
  const baseYm = (byId("reYm").value || "").replace("-", "");
  if (!/^\d{6}$/.test(baseYm)) { out.innerHTML = ""; return; }
  // 기준월 포함 최근 6개월
  const months = [];
  let y = +baseYm.slice(0, 4), m = +baseYm.slice(4, 6);
  for (let i = 0; i < 6; i++) { months.unshift(`${y}${String(m).padStart(2, "0")}`); m--; if (m === 0) { m = 12; y--; } }
  out.innerHTML = `<p class="status loading">📈 최근 6개월 시세를 불러오는 중…</p>`;
  try {
    const results = await Promise.all(months.map(async (ym) => {
      try {
        const d = await (await fetch(`/api/realestate?type=${apiType}&lawd=${lawd}&ym=${ym}`)).json();
        let rows = d.ok ? (d.rows || []) : [];
        if (kind) rows = rows.filter((r) => r.kind === kind);
        const prices = rows.map((r) => rePrice(uiType, r)).filter((v) => v > 0);
        const avg = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
        return { ym, avg, count: prices.length };
      } catch { return { ym, avg: 0, count: 0 }; }
    }));
    out.innerHTML = renderTrendChart(results, uiType);
  } catch (e) { out.innerHTML = `<p class="status warn">추이 조회 실패: ${E(e.message)}</p>`; }
}
function renderTrendChart(data, uiType) {
  const max = Math.max(...data.map((d) => d.avg), 1);
  const unit = uiType === "wolse" || uiType === "jeonse" ? "보증금" : "거래가";
  const W = 300, H = 120, pad = 4, bw = (W - pad * 2) / data.length;
  const bars = data.map((d, i) => {
    const h = d.avg ? Math.max(4, (d.avg / max) * (H - 28)) : 0;
    const x = pad + i * bw, y = H - 20 - h;
    return `<g>
      <rect x="${(x + bw * 0.15).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="var(--accent)"></rect>
      <text x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="var(--muted)">${d.ym.slice(4)}월</text>
      ${d.avg ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--text)">${(d.avg / 10000).toFixed(1)}</text>` : `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 24}" text-anchor="middle" font-size="9" fill="var(--muted)">·</text>`}
    </g>`;
  }).join("");
  const rows = data.map((d) => `${d.ym.slice(0, 4)}.${d.ym.slice(4)} 평균 ${d.avg ? eok(d.avg) : "-"} · ${d.count}건`).join(" / ");
  return `<div class="trend-wrap">
    <h4>📈 ${E(reCache.regionName)} ${unit} 월별 평균 <span class="opt">(억원, 최근 6개월)</span></h4>
    <svg viewBox="0 0 ${W} ${H}" class="trend-svg" role="img" aria-label="월별 평균 시세 막대그래프">${bars}</svg>
    <p class="hint">${E(rows)}</p>
  </div>`;
}
byId("reRankBtn").addEventListener("click", renderReRanking);
byId("reTrendBtn").addEventListener("click", loadReTrend);
// 필터·정렬을 바꾸면 1페이지로 되돌린다.
const applyReFilterReset = () => { rePage = 1; applyReFilter(); };
byId("reApply").addEventListener("click", applyReFilterReset);
["reMin", "reMax", "reMonMax", "reApt"].forEach((id) => byId(id).addEventListener("keydown", (e) => { if (e.key === "Enter") applyReFilterReset(); }));
byId("reSort").addEventListener("change", applyReFilterReset);
byId("reApt").addEventListener("input", () => { if (reCache.rows.length) applyReFilterReset(); });   // 단지명 실시간 필터

const eok = (manwon) => manwon >= 10000 ? `${(manwon / 10000).toFixed(manwon % 10000 ? 1 : 0)}억` + (manwon % 10000 ? ` ${(manwon % 10000).toLocaleString()}만` : "") : `${manwon.toLocaleString()}만`;
function renderRealEstate(uiType, r) {
  let price;
  if (uiType === "wolse") price = `보증 ${eok(r.deposit)} / 월 ${(r.monthly || 0).toLocaleString()}만`;
  else if (uiType === "jeonse") price = `전세 ${eok(r.deposit)}`;
  else price = eok(r.amount) + "원";
  // RTMS는 좌표를 주지 않아 '시군구 + 법정동 + 아파트명'으로 카카오맵 검색 링크 생성
  const sido = (reCache.regionName || "").split(" ")[0] || "";
  const q = [sido, r.dong, r.apt].filter(Boolean).join(" ");
  const map = `<a class="btn map" href="https://map.kakao.com/link/search/${encodeURIComponent(q)}" target="_blank" rel="noopener">🗺️ 지도</a>`;
  return `<article class="card">
    <div class="card-top"><h3>${E(r.apt)}</h3><span class="bed ok">${E(price)}</span></div>
    <p class="meta">${E(r.dong)}${r.area ? ` · ${r.area}㎡(${(r.area / 3.3058).toFixed(0)}평)` : ""}${r.floor ? ` · ${E(r.floor)}층` : ""}${r.buildYear ? ` · ${E(r.buildYear)}년준공` : ""}</p>
    <p class="meta">📅 ${E(r.date)} 신고${r.kind ? ` · ${E(r.kind)}` : ""}</p>
    <div class="card-actions">${map}</div>
  </article>`;
}
byId("reBtn").addEventListener("click", searchRealEstate);

// ==================== 😷 미세먼지 ====================
const SIDOS = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
function initAir() { byId("airSido").innerHTML = SIDOS.map((s) => `<option value="${s}">${s}</option>`).join(""); }
let airCache = null; // {sido, summary, forecast, stations}
async function searchAir() {
  const sido = byId("airSido").value;
  setBox("airStatus", "조회 중…", "loading"); showSkeletons("airResults");
  try {
    const d = await (await fetch(`/api/air?sido=${encodeURIComponent(sido)}`)).json();
    if (d.needKey) return endEmpty("airResults", "airStatus", "⚠️ 미세먼지 기능은 DATA_API_KEY 설정 후 이용 가능합니다.", "warn");
    if (!d.ok) return endEmpty("airResults", "airStatus", d.error || "조회 실패", "warn");
    if (!(d.stations || []).length) return endEmpty("airResults", "airStatus", "측정 데이터가 없습니다.", "warn");
    airCache = d;
    applyAirFilter();
  } catch (e) { setBox("airStatus", `오류: ${e.message}`, "error"); retryBox("airResults", e.message, searchAir); }
}
const GRADE_EMOJI = { ok: "😀", warn: "🙂", busy: "😷", full: "🤢", "": "❓" };
// 예보 등급 텍스트(좋음/보통/나쁨/매우나쁨) → 색상 클래스
const KGRADE_CLASS = { "좋음": "ok", "보통": "warn", "나쁨": "busy", "매우나쁨": "full" };
// 오늘·내일·모레 예보 (PM10·PM2.5) — 서버가 준 forecast10/25 배열을 칩으로
function airForecastHtml(sido, d) {
  const line = (title, days) => {
    if (!days || !days.length) return "";
    const chips = days.map((f) => `<span class="fc-chip ${KGRADE_CLASS[f.sidoGrade] || ""}"><b>${E(f.label)}</b> ${E(f.sidoGrade || "-")}</span>`).join("");
    const overall = days[0] && days[0].overall ? `<div class="fc-overall">📢 ${E(days[0].overall)}</div>` : "";
    return `<div class="fc-line"><span class="fc-key">${title}</span><span class="fc-chips">${chips}</span></div>${overall}`;
  };
  const p10 = line("PM10", d.forecast10 || (d.forecast ? [{ label: "오늘", sidoGrade: d.forecast.sidoGrade, overall: d.forecast.overall }] : []));
  const p25 = line("PM2.5", d.forecast25 || (d.forecastPm25 ? [{ label: "오늘", sidoGrade: d.forecastPm25.sidoGrade, overall: d.forecastPm25.overall }] : []));
  return p10 || p25 ? `<div class="forecast">${p10}${p25}</div>` : "";
}
function applyAirFilter() {
  if (!airCache) return;
  const d = airCache, sido = d.sido;
  const q = byId("airQ").value.trim(), g = byId("airGrade").value;
  const std = byId("airStd").value, pol = byId("airPollutant").value;   // 기준(환경부/WHO) · 기준물질
  // 등급을 클라이언트에서 선택 기준으로 재계산 (WHO 토글이 카드·요약·필터에 모두 반영되게)
  const grade = (s) => ({ pm10: airGradeOf(s.pm10, "pm10", std), pm25: airGradeOf(s.pm25, "pm25", std) });
  let st = (d.stations || []).map((s) => ({ ...s, g: grade(s) }));
  if (q) st = st.filter((s) => String(s.station || "").includes(q));
  if (g) st = st.filter((s) => s.g[pol].c === g);   // 선택한 기준물질(PM10/PM2.5) 등급으로 필터

  const g10 = airGradeOf(d.summary.pm10, "pm10", std), g25 = airGradeOf(d.summary.pm25, "pm25", std);
  const worst = [g10, g25].sort((a, b) => "ok warn busy full".indexOf(b.c) - "ok warn busy full".indexOf(a.c))[0];
  const stdLabel = std === "who" ? "WHO 기준" : "환경부 기준";
  const head = `<article class="card">
    <div class="card-top"><h3>${GRADE_EMOJI[worst.c] || ""} ${E(sido)} 평균 <span class="opt">(${stdLabel})</span></h3></div>
    <div class="dust-summary">
      <div class="dust-box ${g10.c}"><span>미세먼지 PM10</span><b>${d.summary.pm10 ?? "-"}</b><em>${g10.t}</em></div>
      <div class="dust-box ${g25.c}"><span>초미세 PM2.5</span><b>${d.summary.pm25 ?? "-"}</b><em>${g25.t}</em></div>
    </div>
    ${airForecastHtml(sido, d)}
  </article>`;

  if (!st.length) {
    setBox("airStatus", `조건에 맞는 측정소가 없습니다. (전체 ${d.stations.length}곳)`, "warn");
    byId("airResults").innerHTML = head; return;
  }
  const polLabel = pol === "pm25" ? "PM2.5" : "PM10";
  setBox("airStatus", `${sido} · 측정소 ${st.length}곳${st.length !== d.stations.length ? ` / 전체 ${d.stations.length}` : ""} · ${polLabel} ${stdLabel}`, "ok");
  byId("airResults").innerHTML = head + st.map((s) => `
    <article class="card">
      <div class="card-top"><h3>${E(s.station)}</h3><span class="bed ${s.g.pm10.c}">PM10 ${s.pm10 ?? "-"} · ${E(s.g.pm10.t)}</span></div>
      <p class="meta">초미세(PM2.5) ${s.pm25 ?? "-"} · ${E(s.g.pm25.t)}${s.o3 != null ? ` · 오존 ${s.o3}` : ""}${s.time ? ` · ${E(s.time)}` : ""}</p>
    </article>`).join("");
}
byId("airQ").addEventListener("input", () => { if (airCache) applyAirFilter(); });
byId("airGrade").addEventListener("change", () => { if (airCache) applyAirFilter(); });
byId("airPollutant").addEventListener("change", () => { if (airCache) applyAirFilter(); });
byId("airStd").addEventListener("change", () => { if (airCache) applyAirFilter(); });

// 헤더: 수도권 평균 미세먼지 배지
async function loadDustBadge() {
  try {
    const d = await (await fetch("/api/air?op=metro")).json();
    if (!d.ok || d.pm10 == null) return;
    const g = airGradeOf(d.pm10, "pm10");
    const el = byId("dustBadge");
    el.className = `dust-badge ${g.c}`;
    el.innerHTML = `😷 <b>${d.pm10}</b> <span>${g.t}</span>`;
    el.title = `수도권 평균 · 미세먼지 ${d.pm10}㎍/㎥ (${g.t}) · 초미세 ${d.pm25 ?? "-"} · 측정소 ${d.stations}곳`;
    el.style.display = "";
    el.addEventListener("click", () => switchPanel("air"));
  } catch { /* 배지는 실패해도 무시 */ }
}
// PM 수치 → 등급(환경부 기준)
// 등급 임계값 — 환경부 4단계 + WHO(엄격) 4단계(WHO 24h 가이드라인 기반으로 더 촘촘히)
const AIR_TH = {
  env: { pm10: [30, 80, 150], pm25: [15, 35, 75] },
  who: { pm10: [20, 45, 100], pm25: [10, 25, 50] },
};
function airGradeOf(v, kind, std = "env") {
  if (v == null) return { t: "-", c: "" };
  const th = (AIR_TH[std] || AIR_TH.env)[kind];
  const c = v <= th[0] ? "ok" : v <= th[1] ? "warn" : v <= th[2] ? "busy" : "full";
  const t = v <= th[0] ? "좋음" : v <= th[1] ? "보통" : v <= th[2] ? "나쁨" : "매우나쁨";
  return { t, c };
}
byId("airBtn").addEventListener("click", searchAir);

// ==================== 🚏 시내버스 ====================
async function searchCitybus() {
  try {
    const { lat, lon } = await getLocation("cbStatus", "cbAddr");
    setBox("cbStatus", "정류소 조회 중…", "loading"); showSkeletons("cbResults");
    const d = await (await fetch(`/api/citybus?op=near&lat=${lat}&lon=${lon}`)).json();
    if (d.needKey) return endEmpty("cbResults", "cbStatus", "⚠️ 시내버스 기능은 DATA_API_KEY 설정 후 이용 가능합니다.", "warn");
    const stops = d.stops || [];
    if (!stops.length) return endEmpty("cbResults", "cbStatus", "주변 정류소가 없습니다.", "warn");
    setBox("cbStatus", `가까운 정류소 ${stops.length}곳 · 정류소를 누르면 도착정보`, "ok");
    byId("cbResults").innerHTML = stops.map((s) => `
      <article class="card cb-stop" data-city="${E(s.city)}" data-node="${E(s.node)}" data-name="${E(s.name)}" style="cursor:pointer">
        <div class="card-top"><h3>🚏 ${E(s.name)}${s.arsno ? ` <span class="opt">${E(s.arsno)}</span>` : ""}</h3>
          ${s.distance != null ? `<span class="bed ok">${s.distance.toLocaleString()}m</span>` : ""}</div>
        <p class="meta">누르면 실시간 도착정보 표시 <span class="opt">▾</span></p>
        <div class="cb-arrivals"></div>
      </article>`).join("");
    if (window.GongMap) GongMap.set("citybus", stops.map((s) => ({ lat: s.lat, lon: s.lon, label: s.name, sub: s.arsno ? `정류소번호 ${s.arsno}` : "" })), { lat, lon });
  } catch (e) { setBox("cbStatus", `오류: ${e.message}`, "error"); retryBox("cbResults", e.message, searchCitybus); }
}
// 도착정보는 매번 새로 불러온다(실시간). 열려 있으면 접고, 열 때마다 재조회한다.
// (이전엔 dataset.loaded로 캐시해 두 번째 클릭부터 옛 값만 토글돼 "실시간"이 깨졌다.)
async function loadArrivals(cardEl) {
  const box = cardEl.querySelector(".cb-arrivals");
  if (cardEl.dataset.open === "1") { box.style.display = "none"; cardEl.dataset.open = "0"; return; }
  cardEl.dataset.open = "1"; box.style.display = "";
  box.innerHTML = `<p class="meta">도착정보 조회 중…</p>`;
  try {
    const d = await (await fetch(`/api/citybus?op=arrival&city=${encodeURIComponent(cardEl.dataset.city)}&node=${encodeURIComponent(cardEl.dataset.node)}`)).json();
    const buses = d.buses || [];
    const stamp = `<p class="meta opt" style="margin-top:6px">🔄 ${kstClock()} 기준 · 다시 누르면 최신</p>`;
    box.innerHTML = (buses.length
      ? `<ul class="time-stats">${buses.slice(0, 12).map((b) => `<li class="meta"><b>${E(b.route)}</b>${b.type ? `<span class="chip" style="margin-left:6px">${E(b.type)}</span>` : ""} — ${b.min <= 1 ? "곧 도착" : b.min + "분 후"} · ${b.prevCnt}정류장 전</li>`).join("")}</ul>`
      : `<p class="meta">현재 도착 예정 버스가 없습니다.</p>`) + stamp;
  } catch (e) { box.innerHTML = `<p class="status warn">도착정보 오류: ${E(e.message)}</p>`; cardEl.dataset.open = "0"; }
}
byId("cbBtn").addEventListener("click", searchCitybus);
byId("cbResults").addEventListener("click", (e) => {
  const card = e.target.closest(".cb-stop");
  if (card) loadArrivals(card);
});

// ==================== 🏘️ LH 청약 ====================
let lhCache = [];
let lhMeta = {};            // truncated / failedPages
const LH_PAGE_SIZE = 20;
let lhPage = 1;
// 상태 우선순위(열린 공고 먼저) + 배지색
const LH_OPEN = ["공고중", "접수중", "상담요청"];
function lhBadge(status) {
  const s = String(status || "");
  if (s.includes("접수중")) return "ok";
  if (s.includes("공고중")) return "ok";
  if (s.includes("상담요청")) return "warn";
  if (s.includes("마감") || s.includes("종료")) return "full";
  return "warn";
}
function fillLhFilters(rows) {
  const fill = (id, vals, label) => {
    const sel = byId(id), cur = sel.value;
    sel.innerHTML = `<option value="">${label}</option>` + vals.map((v) => `<option value="${E(v)}">${E(v)}</option>`).join("");
    if (vals.includes(cur)) sel.value = cur;
  };
  fill("lhRegion", [...new Set(rows.map((r) => r.region).filter(Boolean))].sort(), "전체 지역");
  const statuses = [...new Set(rows.map((r) => r.status).filter(Boolean))];
  // 요청 순서(공고중·상담요청·접수중·마감) 우선 정렬
  const order = ["공고중", "접수중", "상담요청"];
  statuses.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b, "ko"));
  fill("lhStatusF", statuses, "전체 상태");
}
async function searchLH() {
  setBox("lhStatus", "공고 조회 중…", "loading"); showSkeletons("lhResults"); clearPager("lhPager");
  try {
    // 서버가 전 페이지를 모아 주므로(API 기본창 = 최근 2개월) 필터·페이지네이션은 클라이언트에서 처리한다.
    const d = await (await fetch(`/api/lh`)).json();
    if (d.needKey) return endEmpty("lhResults", "lhStatus", "⚠️ LH 기능은 DATA_API_KEY 설정 후 이용 가능합니다.", "warn");
    if (!d.ok) return endEmpty("lhResults", "lhStatus", d.message || "조회 실패", "warn");
    lhCache = d.rows || [];
    lhMeta = { truncated: d.truncated, failedPages: d.failedPages };
    if (!lhCache.length) return endEmpty("lhResults", "lhStatus", "공고가 없습니다.", "warn");
    lhPage = 1;
    fillLhFilters(lhCache);
    applyLhFilter();
  } catch (e) { setBox("lhStatus", `오류: ${e.message}`, "error"); retryBox("lhResults", e.message, searchLH); }
}
function applyLhFilter() {
  if (!lhCache.length) return;
  const name = byId("lhName").value.trim();
  const region = byId("lhRegion").value, status = byId("lhStatusF").value;
  let rows = lhCache;
  if (name) rows = rows.filter((r) => r.name.includes(name));
  if (region) rows = rows.filter((r) => r.region === region);
  if (status) rows = rows.filter((r) => r.status === status);
  // 열린 공고 먼저
  rows = rows.slice().sort((a, b) => (LH_OPEN.some((s) => b.status.includes(s)) ? 1 : 0) - (LH_OPEN.some((s) => a.status.includes(s)) ? 1 : 0));

  if (!rows.length) { clearPager("lhPager"); return endEmpty("lhResults", "lhStatus", `조건에 맞는 공고가 없습니다. (전체 ${lhCache.length}건)`, "warn"); }

  const totalPages = Math.max(Math.ceil(rows.length / LH_PAGE_SIZE), 1);
  if (lhPage > totalPages) lhPage = totalPages;
  const slice = rows.slice((lhPage - 1) * LH_PAGE_SIZE, lhPage * LH_PAGE_SIZE);

  setBox("lhStatus", `공고 ${rows.length.toLocaleString()}건${rows.length !== lhCache.length ? ` / 전체 ${lhCache.length.toLocaleString()}` : ""}${collectWarning(lhMeta)}`, "ok");
  byId("lhResults").innerHTML = slice.map((r) => {
    const url = safeUrl(r.url);   // LH가 준 DTL_URL — http(s)가 아니면 링크로 만들지 않는다
    const actions = [
      url ? `<a class="btn map" href="${E(url)}" target="_blank" rel="noopener noreferrer">상세공고 ↗</a>` : "",
      icsDateParts(r.closeDate) ? `<button type="button" class="btn ics-btn" data-name="${E(r.name)}" data-close="${E(r.closeDate)}">📅 마감일 저장</button>` : "",
    ].filter(Boolean).join("");
    return `<article class="card">
      <div class="card-top"><h3>${E(r.name)}</h3><span class="bed ${lhBadge(r.status)}">${E(r.status || "-")}</span></div>
      <p class="meta">${[r.type, r.region].filter(Boolean).map(E).join(" · ")}</p>
      <p class="meta">📅 게시 ${E(r.postDate || "-")}${r.closeDate ? ` · 마감 ${E(r.closeDate)}` : ""}</p>
      ${actions ? `<div class="card-actions">${actions}</div>` : ""}
    </article>`;
  }).join("");
  renderPager("lhPager", lhPage, totalPages, (p) => { lhPage = p; applyLhFilter(); scrollToResults("lhResults"); }, rows.length);
}
// ---- LH 마감일 → 캘린더(.ics) ----
// 무로그인이라 서버 알림은 불가하지만, 마감일을 캘린더에 담아 사용자 기기가 리마인드하게 한다.
function icsDateParts(s) { const m = String(s || "").match(/(\d{4})\D?(\d{1,2})\D?(\d{1,2})/); return m ? [m[1], m[2].padStart(2, "0"), m[3].padStart(2, "0")] : null; }
const icsEsc = (s) => String(s || "").replace(/([\\;,])/g, "\\$1").replace(/\r?\n/g, "\\n");
function downloadIcs(name, closeDate) {
  const p = icsDateParts(closeDate);
  if (!p) return alert("마감일 형식을 인식할 수 없어 캘린더에 담을 수 없습니다.");
  const [y, mo, da] = p;
  const start = `${y}${mo}${da}`;
  const end = new Date(Date.UTC(+y, +mo - 1, +da + 1));   // 종일 이벤트 DTEND는 다음 날
  const endStr = `${end.getUTCFullYear()}${String(end.getUTCMonth() + 1).padStart(2, "0")}${String(end.getUTCDate()).padStart(2, "0")}`;
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}T${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}Z`;
  const uid = `lh-${start}-${Math.abs([...String(name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7))}@gong-medical`;
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//gong-medical-app//LH//KO", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${endStr}`,
    `SUMMARY:[LH청약 마감] ${icsEsc(name)}`, `DESCRIPTION:${icsEsc(name)} 청약 접수 마감일`,
    "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:LH청약 마감 하루 전", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `LH마감-${start}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
byId("lhResults").addEventListener("click", (e) => {
  const b = e.target.closest(".ics-btn");
  if (b) downloadIcs(b.dataset.name, b.dataset.close);
});
// 필터를 바꾸면 1페이지로 되돌린다.
const applyLhFilterReset = () => { lhPage = 1; applyLhFilter(); };
byId("lhRegion").addEventListener("change", () => { if (lhCache.length) applyLhFilterReset(); });
byId("lhStatusF").addEventListener("change", () => { if (lhCache.length) applyLhFilterReset(); });
byId("lhName").addEventListener("input", () => { if (lhCache.length) applyLhFilterReset(); });
// 공공임대 단지 (마이홈, LH·SH·지방)
async function searchRental() {
  const brtc = byId("lhSido").value;
  setBox("lhStatus", "공공임대 단지 조회 중…", "loading"); showSkeletons("lhResults");
  try {
    const d = await (await fetch(`/api/myhome?brtc=${brtc}&size=60`)).json();
    if (d.needKey) return endEmpty("lhResults", "lhStatus", "⚠️ DATA_API_KEY 설정 후 이용 가능합니다.", "warn");
    if (d.pending) return endEmpty("lhResults", "lhStatus", "ℹ️ " + d.message, "warn");
    if (!d.ok) return endEmpty("lhResults", "lhStatus", d.message || "조회 실패", "warn");
    const rows = d.rows || [];
    if (!rows.length) return endEmpty("lhResults", "lhStatus", "단지 정보가 없습니다.", "warn");
    setBox("lhStatus", `공공임대 단지 ${rows.length}곳`, "ok");
    byId("lhResults").innerHTML = rows.map((r) => `
      <article class="card">
        <div class="card-top"><h3>🏢 ${E(r.name)}</h3>${r.supply ? `<span class="bed ok">${E(r.supply)}</span>` : ""}</div>
        ${r.addr ? `<p class="addr">📍 ${E(r.addr)}</p>` : ""}
        <p class="meta">${[r.households ? `${r.households.toLocaleString()}세대` : "", r.area ? `${r.area}` : "", r.built ? `준공 ${r.built}` : ""].filter(Boolean).map(E).join(" · ")}</p>
      </article>`).join("");
  } catch (e) { setBox("lhStatus", `오류: ${e.message}`, "error"); retryBox("lhResults", e.message, searchRental); }
}
function syncLhMode() {
  const rental = byId("lhMode").value === "rental";
  byId("panel-lh").querySelector(".lh-notice").style.display = rental ? "none" : "";
  byId("panel-lh").querySelector(".lh-rental").style.display = rental ? "" : "none";
}
byId("lhMode").addEventListener("change", syncLhMode);
byId("lhBtn").addEventListener("click", () => byId("lhMode").value === "rental" ? searchRental() : searchLH());
byId("lhName").addEventListener("keydown", (e) => { if (e.key === "Enter") searchLH(); });

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
  } catch (e) { setBox("pkStatus", `오류: ${e.message}`, "error"); retryBox("pkResults", e.message, () => searchParking(1)); }
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
    const [gas, bike, cb, pk] = await Promise.all([
      jget(`/api/gas?lat=${lat}&lon=${lon}&prodcd=B027&radius=2000`),
      jget(`/api/bike?lat=${lat}&lon=${lon}`),
      jget(`/api/citybus?op=near&lat=${lat}&lon=${lon}`),
      jget(`/api/parking?lat=${lat}&lon=${lon}&page=1&size=3`),
    ]);
    const gasItems = (gas.rows || []).slice(0, 3).map((s) => ({ name: s.name, meta: `${s.price ? s.price.toLocaleString() + "원/L" : "-"} · ${nbDist(s.distance)}` }));
    const bikeItems = (bike.rows || []).slice(0, 3).map((s) => ({ name: s.name, meta: `자전거 ${s.bikes}대 · ${nbDist(s.distance)}` }));
    const cbItems = (cb.stops || []).slice(0, 3).map((s) => ({ name: s.name, meta: `${s.arsno ? s.arsno + " · " : ""}${nbDist(s.distance)}` }));
    const pkItems = (pk.rows || []).slice(0, 3).map((p) => ({ name: p.name, meta: `${p.available != null ? "잔여 " + p.available + " · " : ""}${nbDist(p.distance)}` }));
    const total = gasItems.length + bikeItems.length + cbItems.length + pkItems.length;
    if (!total) return endEmpty("nbResults", "nbStatus", "주변 정보를 찾지 못했습니다. 주소를 입력해보세요.", "warn");
    setBox("nbStatus", `내 주변 요약 · ${kstClock()} 기준`, "ok");
    byId("nbResults").innerHTML =
      nbGroup("⛽", "주유소(휘발유 최저가)", "gas", gasItems) +
      nbGroup("🚲", "따릉이 대여소", "bike", bikeItems) +
      nbGroup("🚏", "버스 정류소", "citybus", cbItems) +
      nbGroup("🅿️", "주차장", "parking", pkItems);
  } catch (e) { setBox("nbStatus", `오류: ${e.message}`, "error"); retryBox("nbResults", e.message, searchNearby); }
}
byId("nbBtn").addEventListener("click", searchNearby);
byId("nbResults").addEventListener("click", (e) => {
  const b = e.target.closest(".nb-more");
  if (!b) return;
  // 내 주변에서 주소를 썼다면 해당 탭 주소칸에 넘겨준다(GPS면 캐시 공유로 그대로 조회)
  const addr = byId("nbAddr").value.trim();
  const addrTarget = { gas: "gasAddr", bike: "bikeAddr", citybus: "cbAddr", parking: "pkAddr" }[b.dataset.panel];
  if (addr && addrTarget && byId(addrTarget)) byId(addrTarget).value = addr;
  switchPanel(b.dataset.panel);
});

// ---------- 입력창 지우기(×) 버튼 ----------
// 주요 텍스트 입력에 clear 버튼을 주입(모바일에서 긴 주소·역명 재입력 마찰 감소).
(function initClearButtons() {
  const ids = ["gasAddr", "bikeAddr", "cbAddr", "pkAddr", "nbAddr", "densQ", "airQ", "reApt", "lhName", "hwQ", "lottoMine"];
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
    { resultsId: "cbResults",   btnId: "cbBtn",   run: () => searchCitybus() },
    { resultsId: "pkResults",   btnId: "pkBtn",   run: () => searchParking(1) },
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
  syncLhMode();
  initRealEstate();
  syncReType();
  initAir();
  loadDustBadge();
  applyHashPanel();   // #parking 등으로 들어온 경우 해당 탭을 연다
})();
