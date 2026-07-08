// ===== 생활서비스 확장 로직 (혼잡도·영화관·버스·분실물) =====
// 지하철(app.js)과 별개 <script>. 전역 충돌을 피하려 helper 이름을 app.js와 다르게 둔다.
const byId = (id) => document.getElementById(id);
const E = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function setBox(id, msg, type = "") { const el = byId(id); if (el) { el.textContent = msg; el.className = "status " + type; } }
function kstTodayISO() { const d = new Date(Date.now() + 9 * 3600e3); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`; }
const ymd = (iso) => String(iso || "").replace(/-/g, "");

// ---------- 상단 서비스 탭 전환 ----------
function switchPanel(name) {
  document.querySelectorAll(".toptab").forEach((b) => b.classList.toggle("active", b.dataset.panel === name));
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === `panel-${name}`));
  if (name === "bus") ensureTerminals();
  if (name === "gas") loadGasAvg();
}
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
document.querySelectorAll(".toptab").forEach((b) => b.addEventListener("click", () => switchPanel(b.dataset.panel)));

// 오류 재시도 박스 (app.js showError와 동일 톤)
function retryBox(resultsId, msg, retryFn) {
  const timeout = /시간 초과|timeout|Failed to fetch|network/i.test(msg);
  byId(resultsId).innerHTML =
    `<div class="retry-box"><div class="retry-ico">${timeout ? "⏱️" : "⚠️"}</div>
      <p class="retry-msg">${E(timeout ? "서버 응답이 지연되고 있습니다." : msg)}</p>
      <p class="retry-sub">외부 공공/공식 서비스가 일시적으로 불안정할 수 있습니다.</p>
      <button class="search-btn retry-btn">🔄 다시 시도</button></div>`;
  const btn = byId(resultsId).querySelector(".retry-btn");
  if (btn && retryFn) btn.addEventListener("click", retryFn);
}

// ==================== 👥 실시간 혼잡도 ====================
const DENSITY_AREAS = ["경복궁","광화문·덕수궁","보신각","창덕궁·종묘","동대문 관광특구","명동 관광특구","이태원 관광특구","잠실 관광특구","종로·청계 관광특구","홍대 관광특구","강서한강공원","고척돔","광나루한강공원","광화문광장","국립중앙박물관·용산가족공원","난지한강공원","남산공원","노들섬","뚝섬한강공원","망원한강공원","반포한강공원","보라매공원","북서울꿈의숲","서대문독립공원","서리풀공원·몽마르뜨공원","서울대공원","서울숲공원","송현녹지광장","아차산","안양천","양화한강공원","어린이대공원","여의도한강공원","여의서로","올림픽공원","월드컵공원","응봉산","이촌한강공원","잠실종합운동장","잠실한강공원","잠원한강공원","청계산","홍제폭포","가락시장","가로수길","광장(전통)시장","김포공항","남대문시장","노량진","덕수궁길·정동길","북창동 먹자골목","북촌한옥마을","서촌","성수카페거리","송리단길·호수단길","신촌 스타광장","압구정로데오거리","여의도","연남동","영등포 타임스퀘어","용리단길","이태원 앤틱가구거리","익선동","인사동","잠실롯데타워·석촌호수","창동 신경제 중심지","청담동 명품거리","청량리 제기동 일대 전통시장","해방촌·경리단길","가산디지털단지역","강남역","건대입구역","고덕역","고속터미널역","교대역","구로디지털단지역","구로역","군자역","대림역","동대문역","뚝섬역","미아사거리역","발산역","사당역","삼각지역","서울대입구역","서울식물원·마곡나루역","서울역","성신여대입구역","선릉역","수유역","신논현역·논현역","신도림역","신림역","신촌·이대역","쌍문역","신정네거리역","역삼역","연신내역","양재역","왕십리역","용산역","오목교역·목동운동장","잠실새내역","잠실역","장지역","장한평역","천호역","총신대입구(이수)역","충정로역","합정역","혜화역","홍대입구역(2호선)","회기역"];
const DENSITY_LEVEL = { "여유": "ok", "보통": "warn", "약간 붐빔": "busy", "붐빔": "full" };
byId("densList").innerHTML = DENSITY_AREAS.map((a) => `<option value="${E(a)}"></option>`).join("");

async function searchDensity() {
  const area = byId("densQ").value.trim();
  if (!area) return setBox("densStatus", "장소명을 입력하세요.", "warn");
  setBox("densStatus", "조회 중…", "loading"); byId("densResults").innerHTML = "";
  try {
    const r = await fetch(`/api/density?area=${encodeURIComponent(area)}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    const rows = d.rows || [];
    if (!rows.length) return setBox("densStatus", `'${area}' 실시간 데이터가 없습니다. 목록의 정확한 장소명으로 다시 시도하세요.`, "warn");
    setBox("densStatus", `${rows.length}곳`, "ok");
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

// ==================== 🎬 영화관 ====================
const CINE_NAME = { cgv: "CGV", megabox: "메가박스", lottecinema: "롯데시네마" };
function cineOpsFor(chain) {
  // CGV=timetable, 메가박스·롯데=seats. UI의 '시간표/잔여석'을 체인에 맞게 매핑.
  return chain === "cgv" ? "timetable" : "seats";
}
function syncCineDate() {
  const op = byId("cineOp").value;
  byId("panel-cinema").querySelector(".cine-date").style.display = op === "theaters" ? "none" : "";
}
byId("cineOp").addEventListener("change", syncCineDate);

async function searchCinema() {
  const chain = byId("cineChain").value;
  let op = byId("cineOp").value;
  if (op === "timetable") op = cineOpsFor(chain); // 체인별 실제 op
  const kw = byId("cineKw").value.trim();
  const date = ymd(byId("cineDate").value) || undefined;
  if (op !== "theaters" && !kw) return setBox("cineStatus", "지역/지점을 입력하세요.", "warn");
  setBox("cineStatus", "조회 중…", "loading"); byId("cineResults").innerHTML = "";
  try {
    const qs = new URLSearchParams({ chain, op });
    if (kw) qs.set("keyword", kw);
    if (date && op !== "theaters") qs.set("playDate", date);
    const r = await fetch(`/api/cinema?${qs.toString()}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    if (!d.ok) return setBox("cineStatus", d.message || "조회 결과가 없습니다.", "warn");
    renderCinema(chain, op, d.data);
  } catch (e) { setBox("cineStatus", `오류: ${e.message}`, "error"); retryBox("cineResults", e.message, searchCinema); }
}
function renderCinema(chain, op, data) {
  const name = CINE_NAME[chain];
  if (op === "theaters") {
    const list = data.theaters || data.list || [];
    if (!list.length) return setBox("cineStatus", "일치하는 영화관이 없습니다.", "warn");
    setBox("cineStatus", `${name} · ${list.length}개 영화관`, "ok");
    byId("cineResults").innerHTML = list.map((t) => `
      <article class="card">
        <div class="card-top"><h3>${E(name)} ${E(t.theaterName || t.name || "")}</h3>
          ${t.distanceKm != null ? `<span class="bed ok">${Number(t.distanceKm).toFixed(1)}km</span>` : ""}</div>
        ${t.address ? `<p class="addr">📍 ${E(t.address)}</p>` : ""}
        <p class="meta">코드: ${E(t.theaterCode || t.theaterId || "-")}</p>
      </article>`).join("");
    return;
  }
  if (op === "movies") {
    const list = data.movies || data.list || [];
    if (!list.length) return setBox("cineStatus", "상영작 정보가 없습니다.", "warn");
    setBox("cineStatus", `${name} · 상영작 ${list.length}편`, "ok");
    byId("cineResults").innerHTML = list.map((m) => `
      <article class="card">
        <div class="card-top"><h3>${E(m.movieName || m.title || m.name || "-")}</h3>
          ${m.rating || m.grade ? `<span class="bed warn">${E(m.rating || m.grade)}</span>` : ""}</div>
        <p class="meta">${[m.genre, m.runningTime ? `${m.runningTime}분` : "", m.movieCode ? `코드 ${m.movieCode}` : ""].filter(Boolean).map(E).join(" · ")}</p>
      </article>`).join("");
    return;
  }
  // timetable(CGV) / seats(메가박스·롯데)
  const theaters = data.theaters || (data.theaterName ? [data] : []);
  const schedules = data.schedules || data.timetable || data.playSchedules || [];
  let items = schedules;
  if (!items.length && Array.isArray(theaters)) {
    items = theaters.flatMap((t) => (t.schedules || t.timetable || t.movies || []).map((s) => ({ ...s, _theater: t.theaterName })));
  }
  if (!items.length) {
    // 원본 구조가 다양 → 안내 + 원문 JSON 요약
    setBox("cineStatus", `${name} · 상영/좌석 데이터 형식을 표준화하지 못했습니다.`, "warn");
    byId("cineResults").innerHTML = `<article class="card"><p class="meta">조회는 되었으나 표시 형식이 응답과 달라 요약만 제공합니다. 정확한 시간표·잔여석은 ${E(name)} 공식 앱/웹에서 확인하세요.</p>
      <pre class="rawjson">${E(JSON.stringify(data, null, 1).slice(0, 1200))}</pre></article>`;
    return;
  }
  setBox("cineStatus", `${name} · ${items.length}개 상영`, "ok");
  byId("cineResults").innerHTML = items.slice(0, 60).map((s) => {
    const seat = (s.remainSeat ?? s.restSeat ?? s.availableSeat);
    const total = (s.totalSeat ?? s.seatCapacity);
    return `<article class="card">
      <div class="card-top"><h3>${E(s.movieName || s.title || "-")}</h3>
        ${seat != null ? `<span class="bed ${Number(seat) > 0 ? "ok" : "full"}">잔여 ${E(seat)}${total ? "/" + E(total) : ""}</span>` : ""}</div>
      <p class="meta">${[s._theater || s.theaterName, s.screenName || s.hallName, s.startTime || s.playStartTime, s.playDate].filter(Boolean).map(E).join(" · ")}</p>
    </article>`;
  }).join("");
}
byId("cineBtn").addEventListener("click", searchCinema);
byId("cineKw").addEventListener("keydown", (e) => { if (e.key === "Enter") searchCinema(); });

// ==================== 🚌 버스 ====================
const BUS_OFFICIAL = { express: "https://www.kobus.co.kr/main.do", intercity: "https://intercitybus.tmoney.co.kr/" };
const busCache = {};        // type -> {terminals, routes, byName}
let busTerminalsLoading = false;

function busOfficialCard(type, depName, arrName) {
  const label = depName && arrName ? `${E(depName)} → ${E(arrName)}` : (type === "express" ? "고속버스" : "시외버스");
  const name = type === "express" ? "KOBUS 고속버스" : "티머니 시외버스";
  return `<article class="card busroute"><div class="card-top"><h3>${label}</h3><span class="bed warn">공식 조회</span></div>
    <p class="meta">현재 서버 환경에서 <strong>${name}</strong> 실시간 조회가 제한됩니다(해당 사이트가 외부 서버 접속을 차단). 아래에서 공식 페이지로 시간표·예매를 확인하세요.</p>
    <div class="card-actions"><a class="btn map" href="${BUS_OFFICIAL[type]}" target="_blank" rel="noopener">🎫 공식 예매 페이지 열기</a></div></article>`;
}
async function ensureTerminals() {
  const type = byId("busType").value;
  if (busCache[type]) { if (busCache[type].blocked) showBusBlocked(type); else fillTerminalLists(type); return; }
  if (busTerminalsLoading) return;
  busTerminalsLoading = true;
  setBox("busStatus", "터미널 목록 불러오는 중…", "loading");
  try {
    const r = await fetch(`/api/bus?type=${type}&op=terminals`);
    const d = await r.json();
    if (d.blocked) { busCache[type] = { blocked: true, terminals: [], byName: {} }; setBox("busStatus", "", ""); showBusBlocked(type); return; }
    if (!r.ok || !d.terminals) throw new Error(d.error || `HTTP ${r.status}`);
    const byName = {}; d.terminals.forEach((t) => { byName[t.name] = t.code; });
    busCache[type] = { terminals: d.terminals, routes: d.routes || null, byName };
    setBox("busStatus", "", "");
    fillTerminalLists(type);
  } catch (e) { setBox("busStatus", `터미널 목록 오류: ${e.message}`, "error"); }
  finally { busTerminalsLoading = false; }
}
function showBusBlocked(type) {
  setBox("busStatus", "실시간 조회 제한 — 공식 페이지 안내", "warn");
  byId("busResults").innerHTML = busOfficialCard(type, "", "");
}
function fillTerminalLists(type) {
  const c = busCache[type]; if (!c) return;
  const opt = (t) => `<option value="${E(t.name)}">${t.area ? E(t.area) : ""}</option>`;
  byId("busDepList").innerHTML = c.terminals.map(opt).join("");
  byId("busArrList").innerHTML = c.terminals.map(opt).join("");
}
byId("busType").addEventListener("change", () => { byId("busResults").innerHTML = ""; setBox("busStatus", "", ""); ensureTerminals(); });

function resolveTerminal(type, val) {
  const c = busCache[type]; if (!c) return null;
  if (c.byName[val]) return { code: c.byName[val], name: val };
  const hit = c.terminals.find((t) => t.name === val) || c.terminals.find((t) => t.name.includes(val));
  return hit ? { code: hit.code, name: hit.name } : null;
}
async function searchBus() {
  const type = byId("busType").value;
  await ensureTerminals();
  if (busCache[type]?.blocked) { showBusBlocked(type); return; }
  const dep = resolveTerminal(type, byId("busDep").value.trim());
  const arr = resolveTerminal(type, byId("busArr").value.trim());
  const date = ymd(byId("busDate").value);
  if (!dep || !arr) return setBox("busStatus", "출발·도착 터미널을 목록에서 정확히 선택하세요.", "warn");
  if (!/^\d{8}$/.test(date)) return setBox("busStatus", "날짜를 선택하세요.", "warn");
  setBox("busStatus", "시간표 조회 중…", "loading"); byId("busResults").innerHTML = "";
  try {
    const qs = new URLSearchParams({ type, op: "schedule", dep: dep.code, arr: arr.code, date, depName: dep.name, arrName: arr.name });
    const r = await fetch(`/api/bus?${qs.toString()}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    if (d.blocked) { byId("busResults").innerHTML = busOfficialCard(type, dep.name, arr.name); setBox("busStatus", "실시간 조회 제한 — 공식 페이지 안내", "warn"); return; }
    const rows = d.rows || [];
    const link = `<a class="btn map" href="${BUS_OFFICIAL[type]}" target="_blank" rel="noopener">🎫 공식 예매 페이지</a>`;
    if (!rows.length) {
      setBox("busStatus", "해당 날짜 배차가 없거나 조회에 실패했습니다.", "warn");
      byId("busResults").innerHTML = `<article class="card"><h3>${E(dep.name)} → ${E(arr.name)}</h3><p class="meta">배차 정보를 찾지 못했습니다. 공식 페이지에서 확인하세요.</p><div class="card-actions">${link}</div></article>`;
      return;
    }
    setBox("busStatus", `${dep.name} → ${arr.name} · ${rows.length}편`, "ok");
    const head = `<article class="card busroute"><div class="card-top"><h3>${E(dep.name)} → ${E(arr.name)}</h3><span class="bed ok">${rows.length}편</span></div>
      ${d.note ? `<p class="meta">${E(d.note)}</p>` : ""}<div class="card-actions">${link}</div></article>`;
    byId("busResults").innerHTML = head + rows.map((s) => renderBusRow(type, s)).join("");
  } catch (e) { setBox("busStatus", `오류: ${e.message}`, "error"); retryBox("busResults", e.message, searchBus); }
}
function renderBusRow(type, s) {
  const grade = s.grade ? `<span class="line-badge" style="background:#1a5fd0">${E(s.grade)}</span>` : "";
  const seat = (s.remain != null && s.total != null)
    ? `<span class="bed ${Number(s.remain) > 0 ? "ok" : "full"}">잔여 ${E(s.remain)}/${E(s.total)}</span>` : "";
  return `<article class="card busrow">
    <div class="card-top"><h3>🕐 ${E(s.time)}</h3>${seat}</div>
    <p class="meta">${[s.company, "" ].filter(Boolean).map(E).join(" · ")}${grade}</p>
  </article>`;
}
byId("busBtn").addEventListener("click", searchBus);

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
  setBox("lottoStatus", "조회 중…", "loading"); byId("lottoResults").innerHTML = "";
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
byId("lottoRound").addEventListener("keydown", (e) => { if (e.key === "Enter") searchLotto(); });
byId("lottoMine").addEventListener("keydown", (e) => { if (e.key === "Enter") searchLotto(); });

// ==================== ⛽ 주유소 ====================
// 공용 위치 획득 (브라우저 geolocation, WGS84)
function getLocation(statusId) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("이 브라우저는 위치 기능을 지원하지 않습니다."));
    setBox(statusId, "위치 확인 중… (권한을 허용해주세요)", "loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(new Error(err.code === 1 ? "위치 권한이 거부되었습니다. 주소창 자물쇠에서 허용해주세요." : `위치 확인 실패: ${err.message}`)),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}
async function searchGas() {
  try {
    const { lat, lon } = await getLocation("gasStatus");
    const prodcd = byId("gasProd").value, radius = byId("gasRadius").value;
    setBox("gasStatus", "주유소 조회 중…", "loading"); byId("gasResults").innerHTML = "";
    const r = await fetch(`/api/gas?lat=${lat}&lon=${lon}&prodcd=${prodcd}&radius=${radius}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    if (d.needKey) return setBox("gasStatus", "⚠️ 주유소 기능은 OPINET 인증키 설정 후 이용 가능합니다.", "warn");
    const rows = d.rows || [];
    if (!rows.length) return setBox("gasStatus", d.message || "반경 내 주유소가 없습니다.", "warn");
    setBox("gasStatus", `가격순 ${rows.length}곳 (반경 ${Number(d.radius) / 1000}km)`, "ok");
    byId("gasResults").innerHTML = rows.map((s, i) => renderGas(s, i)).join("");
  } catch (e) { setBox("gasStatus", `오류: ${e.message}`, "error"); }
}
function renderGas(s, i) {
  const chips = [s.selfYn ? "셀프" : "", s.carWash ? "세차장" : "", s.maint ? "경정비" : "", s.cvs ? "편의점" : "", s.kpetro ? "품질인증" : ""]
    .filter(Boolean).map((c) => `<span class="chip">${E(c)}</span>`).join("");
  const map = s.address ? `<a class="btn map" href="https://map.kakao.com/link/search/${encodeURIComponent(s.name)}" target="_blank" rel="noopener">🗺️ 지도</a>` : "";
  const tel = s.tel ? `<a class="btn tel" href="tel:${E(s.tel).replace(/[^0-9]/g, "")}">📞 ${E(s.tel)}</a>` : "";
  return `<article class="card">
    <div class="card-top"><h3>${i === 0 ? "🥇 " : ""}${E(s.name)}</h3>
      <span class="bed ok">${s.price ? s.price.toLocaleString() + "원/L" : "-"}</span></div>
    <p class="meta">${E(s.brand)}${s.distance ? " · " + s.distance.toLocaleString() + "m" : ""}</p>
    ${s.address ? `<p class="addr">📍 ${E(s.address)}</p>` : ""}
    ${chips ? `<div class="chips">${chips}</div>` : ""}
    <div class="card-actions">${tel}${map}</div>
  </article>`;
}
byId("gasBtn").addEventListener("click", searchGas);

// ==================== 🚲 따릉이 ====================
async function searchBike() {
  try {
    const { lat, lon } = await getLocation("bikeStatus");
    setBox("bikeStatus", "대여소 조회 중…", "loading"); byId("bikeResults").innerHTML = "";
    const r = await fetch(`/api/bike?lat=${lat}&lon=${lon}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    const rows = d.rows || [];
    if (!rows.length) return setBox("bikeStatus", d.message || "주변 대여소가 없습니다.", "warn");
    setBox("bikeStatus", `가까운 대여소 ${rows.length}곳`, "ok");
    byId("bikeResults").innerHTML = rows.map((s) => {
      const lvl = s.bikes === 0 ? "full" : s.bikes <= 2 ? "busy" : "ok";
      const map = `<a class="btn map" href="https://map.kakao.com/link/map/${encodeURIComponent(s.name)},${s.lat},${s.lon}" target="_blank" rel="noopener">🗺️ 지도</a>`;
      return `<article class="card">
        <div class="card-top"><h3>${E(s.name)}</h3><span class="bed ${lvl}">자전거 ${s.bikes}대</span></div>
        <p class="meta">🚲 거치대 ${s.racks}개 · 📍 ${s.distance.toLocaleString()}m</p>
        <div class="card-actions">${map}</div>
      </article>`;
    }).join("");
  } catch (e) { setBox("bikeStatus", `오류: ${e.message}`, "error"); }
}
byId("bikeBtn").addEventListener("click", searchBike);

// ==================== 🛣️ 고속도로 (휴게소 + 소통) ====================
function syncHwMode() {
  byId("panel-highway").querySelector(".hw-rest").style.display = byId("hwMode").value === "rest" ? "" : "none";
}
byId("hwMode").addEventListener("change", syncHwMode);
async function searchHighway() {
  const mode = byId("hwMode").value;
  if (mode === "rest" && !byId("hwQ").value.trim()) return setBox("hwStatus", "휴게소명을 입력하세요.", "warn");
  setBox("hwStatus", "조회 중…", "loading"); byId("hwResults").innerHTML = "";
  try {
    const url = mode === "congest" ? "/api/highway?op=congest" : `/api/highway?op=rest&q=${encodeURIComponent(byId("hwQ").value.trim())}`;
    const d = await (await fetch(url)).json();
    if (d.needKey) return setBox("hwStatus", "⚠️ 고속도로 기능은 EX 인증키 설정 후 이용 가능합니다.", "warn");
    if (!d.ok) return setBox("hwStatus", d.message || "조회 실패", "warn");
    const rows = d.rows || [];
    if (!rows.length) return setBox("hwStatus", mode === "congest" ? "현재 정체/서행 구간이 없습니다. 원활합니다 🎉" : "일치하는 휴게소가 없습니다.", mode === "congest" ? "ok" : "warn");
    if (mode === "congest") {
      setBox("hwStatus", `현재 정체/서행 ${rows.length}구간`, "warn");
      byId("hwResults").innerHTML = rows.map(renderCongest).join("");
    } else {
      setBox("hwStatus", `휴게소 ${rows.length}곳`, "ok");
      byId("hwResults").innerHTML = rows.map(renderRestArea).join("");
    }
  } catch (e) { setBox("hwStatus", `오류: ${e.message}`, "error"); retryBox("hwResults", e.message, searchHighway); }
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

// ---------- 초기값 ----------
(function initServices() {
  syncHwMode();
  const today = kstTodayISO();
  ["cineDate", "busDate"].forEach((id) => { const el = byId(id); if (el && !el.value) el.value = today; });
  syncCineDate();
})();
