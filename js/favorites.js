// ===== 즐겨찾기 · 최근 조회 (localStorage) =====
// 회원가입 없는 앱이라 매번 위치·지역·조건을 다시 입력해야 하는 마찰을 줄인다.
// 백엔드 0 — 전부 브라우저 localStorage. services.js 뒤에 로드되어 그 전역(byId, E,
// switchPanel, searchXxx …)을 그대로 쓴다. (classic script의 top-level const는 스크립트 간 공유)

(function () {
  const FAV_KEY = "gong.fav.v1";
  const REC_KEY = "gong.recent.v1";
  const REC_CAP = 30;        // 최근 전체 보관 상한
  const REC_SHOW = 4;        // 패널별 최근 노출 개수

  // ---- 패널별 설정: 어떤 입력이 "조회 조건"을 이루는지 + 조회 실행 함수 ----
  // changeFields: 값 세팅 후 change 이벤트로 UI를 동기화해야 하는 컨트롤(가시성 토글 등)
  const PANELS = {
    // 지하철: 검색 UI(mapStnInput/mapStnBtn)가 노선도 렌더 후 동적 생성 → delegate로 위임 처리
    subway:     { fields: ["mapStnInput"], run: () => { if (byId("mapStnInput")) openMapStation(); }, empty: "지하철역", delegate: { btnId: "mapStnBtn", inputId: "mapStnInput" } },
    density:    { fields: ["densQ"], run: () => searchDensity(), empty: "장소 미지정" },
    gas:        { fields: ["gasProd", "gasRadius", "gasFilter", "gasAddr"], run: () => searchGas(), empty: "내 위치", locKey: "gasAddr" },
    bike:       { fields: ["bikeAddr"], run: () => searchBike(), empty: "내 위치", locKey: "bikeAddr" },
    highway:    { fields: ["hwMode", "hwQ"], changeFields: ["hwMode"], run: () => searchHighway(), empty: "고속도로" },
    realestate: { fields: ["reType", "reRegion", "reYm", "reApt"], changeFields: ["reType"], run: () => searchRealEstate(), empty: "실거래가" },
    lotto:      { fields: ["lottoRound", "lottoMine"], run: () => searchLotto(), empty: "최신 회차" },
    air:        { fields: ["airSido", "airQ", "airGrade"], run: () => searchAir(), empty: "미세먼지" },
    citybus:    { fields: ["cbAddr"], run: () => searchCitybus(), empty: "내 위치", locKey: "cbAddr" },
    lh:         { fields: ["lhMode", "lhName", "lhRegion", "lhStatusF", "lhSido"], changeFields: ["lhMode"], run: () => (byId("lhMode").value === "rental" ? searchRental() : searchLH()), empty: "청약·임대" },
    parking:    { fields: ["pkAddr", "pkFilter"], run: () => searchParking(1), empty: "내 위치", locKey: "pkAddr" },
  };

  const load = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  let favs = load(FAV_KEY);
  let recents = load(REC_KEY);

  // 현재 입력값 스냅샷
  function snapshot(panel) {
    const cfg = PANELS[panel]; const vals = {};
    cfg.fields.forEach((id) => { const el = byId(id); if (el) vals[id] = el.value ?? ""; });
    return vals;
  }
  const keyOf = (panel, vals) => panel + "|" + JSON.stringify(vals);

  // 스냅샷 → 사람이 읽는 라벨 (select는 선택된 옵션 텍스트를 쓴다)
  function labelOf(panel, vals) {
    const parts = [];
    PANELS[panel].fields.forEach((id) => {
      const el = byId(id); const v = vals[id];
      if (v == null || v === "") return;
      if (el && el.tagName === "SELECT") {
        const opt = [...el.options].find((o) => o.value === v);
        if (opt) parts.push(opt.textContent.trim());
      } else {
        parts.push(String(v).trim());
      }
    });
    return parts.filter(Boolean).join(" · ") || PANELS[panel].empty;
  }

  const isFav = (panel, vals) => favs.some((f) => f.key === keyOf(panel, vals));

  function addRecent(panel, vals) {
    const key = keyOf(panel, vals);
    recents = recents.filter((r) => r.key !== key);
    recents.unshift({ panel, key, vals, label: labelOf(panel, vals), ts: Date.now() });
    if (recents.length > REC_CAP) recents = recents.slice(0, REC_CAP);
    save(REC_KEY, recents);
    renderBar(panel);
  }

  function toggleFav(panel, vals) {
    const key = keyOf(panel, vals);
    if (isFav(panel, vals)) favs = favs.filter((f) => f.key !== key);
    else favs.unshift({ panel, key, vals, label: labelOf(panel, vals), ts: Date.now() });
    save(FAV_KEY, favs);
    renderBar(panel);
  }

  function removeEntry(store, key, panel) {
    if (store === "fav") { favs = favs.filter((f) => f.key !== key); save(FAV_KEY, favs); }
    else { recents = recents.filter((r) => r.key !== key); save(REC_KEY, recents); }
    renderBar(panel);
  }

  // 저장된 조건을 입력창에 되채우고 탭을 연다(조회는 하지 않음)
  function fillEntry(panel, vals) {
    const cfg = PANELS[panel];
    (cfg.changeFields || []).forEach((id) => {
      if (id in vals) { const el = byId(id); if (el) { el.value = vals[id]; el.dispatchEvent(new Event("change")); } }
    });
    cfg.fields.forEach((id) => {
      if ((cfg.changeFields || []).includes(id)) return;
      if (id in vals) { const el = byId(id); if (el) el.value = vals[id]; }
    });
    switchPanel(panel);
  }
  // 되채우고 즉시 조회
  function applyEntry(panel, vals) {
    fillEntry(panel, vals);
    try { PANELS[panel].run(); } catch (e) { console.error("favorite apply failed", e); }
  }

  // ---- 공유: 현재 조건을 URL에 담아 복사(또는 공유 시트) ----
  function shareUrl(panel, vals) {
    const sp = new URLSearchParams();
    sp.set("s", panel);
    Object.entries(vals).forEach(([k, v]) => { if (String(v).trim() !== "") sp.set(k, v); });
    return `${location.origin}${location.pathname}?${sp.toString()}#${panel}`;
  }
  async function shareCurrent(panel, btn) {
    const url = shareUrl(panel, snapshot(panel));
    const label = PANELS[panel] && (labelOf(panel, snapshot(panel)));
    try {
      if (navigator.share) { await navigator.share({ title: "서울 교통·생활 정보", text: label, url }); return; }
    } catch { /* 사용자가 공유 취소 — 복사로 폴백하지 않음 */ return; }
    try {
      await navigator.clipboard.writeText(url);
      if (btn) { btn.classList.add("copied"); btn.textContent = "✓ 링크 복사됨"; setTimeout(() => { btn.classList.remove("copied"); btn.textContent = "🔗 공유"; }, 1600); }
    } catch { window.prompt("아래 링크를 복사하세요", url); }
  }

  // ---- 각 패널에 즐겨찾기 바 주입 ----
  function ensureBar(panel) {
    let bar = byId("favbar-" + panel);
    if (bar) return bar;
    const sec = byId("panel-" + panel);
    if (!sec) return null;
    const controls = [...sec.querySelectorAll(".controls")];
    const anchor = controls[controls.length - 1];
    if (!anchor) return null;
    bar = document.createElement("div");
    bar.id = "favbar-" + panel;
    bar.className = "favbar";
    anchor.insertAdjacentElement("afterend", bar);
    return bar;
  }

  function chip(entry, kind) {
    const star = kind === "fav" ? "⭐" : "🕘";
    const del = `<button class="favchip-del" data-act="del" data-store="${kind === "fav" ? "fav" : "rec"}" aria-label="삭제">✕</button>`;
    const promote = kind === "rec" ? `<button class="favchip-star" data-act="star" aria-label="즐겨찾기 추가">☆</button>` : "";
    return `<span class="favchip ${kind}" data-key="${E(entry.key)}">
      <button class="favchip-go" data-act="go">${star} ${E(entry.label)}</button>
      ${promote}${del}</span>`;
  }

  function renderBar(panel) {
    const bar = ensureBar(panel);
    if (!bar) return;
    const pf = favs.filter((f) => f.panel === panel);
    const favKeys = new Set(pf.map((f) => f.key));
    const pr = recents.filter((r) => r.panel === panel && !favKeys.has(r.key)).slice(0, REC_SHOW);
    const chips = pf.map((e) => chip(e, "fav")).join("") + pr.map((e) => chip(e, "rec")).join("");
    const saved = isFav(panel, snapshot(panel));
    bar.innerHTML =
      `<button class="fav-save${saved ? " saved" : ""}" type="button" title="현재 조건을 즐겨찾기에 ${saved ? "해제" : "저장"}">${saved ? "⭐ 저장됨" : "⭐ 이 조건 저장"}</button>` +
      `<button class="fav-share" type="button" title="현재 조건을 링크로 공유">🔗 공유</button>` +
      (chips ? `<div class="fav-chips">${chips}</div>` : `<span class="fav-hint">자주 찾는 조건을 저장해두면 여기서 바로 불러와요</span>`);
  }

  // 입력값이 바뀌면 저장 버튼 상태만 갱신(칩은 그대로 둬 포커스·스크롤 유지)
  function refreshSaveBtn(panel) {
    const bar = byId("favbar-" + panel);
    const btn = bar && bar.querySelector(".fav-save");
    if (!btn) return;
    const saved = isFav(panel, snapshot(panel));
    btn.classList.toggle("saved", saved);
    btn.textContent = saved ? "⭐ 저장됨" : "⭐ 이 조건 저장";
    btn.title = "현재 조건을 즐겨찾기에 " + (saved ? "해제" : "저장");
  }

  // 바 하나에 이벤트 위임 (저장 버튼 + 칩)
  function wireBar(panel) {
    const bar = ensureBar(panel);
    if (!bar || bar.dataset.wired) return;
    bar.dataset.wired = "1";
    bar.addEventListener("click", (e) => {
      const t = e.target.closest("button");
      if (!t) return;
      if (t.classList.contains("fav-save")) { toggleFav(panel, snapshot(panel)); return; }
      if (t.classList.contains("fav-share")) { shareCurrent(panel, t); return; }
      const chipEl = t.closest(".favchip");
      if (!chipEl) return;
      const key = chipEl.dataset.key;
      const entry = favs.find((f) => f.key === key) || recents.find((r) => r.key === key);
      if (!entry) return;
      const act = t.dataset.act;
      if (act === "go") applyEntry(panel, entry.vals);
      else if (act === "star") toggleFav(panel, entry.vals);
      else if (act === "del") removeEntry(t.dataset.store, key, panel);
    });
  }

  // 조회 버튼을 누르면(=검색 시도) 최근 조회로 기록. 실제 검색 함수는 손대지 않는다.
  function maybeRecord(panel) {
    const cfg = PANELS[panel];
    const vals = snapshot(panel);
    // 전부 비었고 위치기반도 아니면 기록 생략
    const hasAny = Object.values(vals).some((v) => String(v).trim() !== "");
    if (hasAny || cfg.locKey) addRecent(panel, vals);
  }
  function wireRecord(panel) {
    const cfg = PANELS[panel];
    const sec = byId("panel-" + panel);
    if (!sec) return;
    if (cfg.delegate) {
      // 동적 생성 UI(지하철 노선도 검색): 패널에 위임해 버튼 클릭·Enter·datalist 선택 시 기록
      sec.addEventListener("click", (e) => { if (e.target && e.target.id === cfg.delegate.btnId) maybeRecord(panel); });
      sec.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target && e.target.id === cfg.delegate.inputId) maybeRecord(panel); });
      sec.addEventListener("change", (e) => { if (e.target && e.target.id === cfg.delegate.inputId) maybeRecord(panel); });
      return;
    }
    const btn = sec.querySelector(".search-btn");
    if (!btn) return;
    btn.addEventListener("click", () => maybeRecord(panel));
  }

  Object.keys(PANELS).forEach((panel) => {
    ensureBar(panel);
    wireBar(panel);
    wireRecord(panel);
    renderBar(panel);
    // 입력을 바꾸면 저장 버튼이 "저장됨/저장"을 정확히 반영하도록
    PANELS[panel].fields.forEach((id) => {
      const el = byId(id);
      if (el) { el.addEventListener("input", () => refreshSaveBtn(panel)); el.addEventListener("change", () => refreshSaveBtn(panel)); }
    });
  });

  // ---- 백업/복원: 무로그인이라 localStorage가 유일 저장소 → 캐시 삭제·기기변경 대비 ----
  const dedupeByKey = (arr) => { const seen = new Set(); return arr.filter((e) => e && e.key && !seen.has(e.key) && seen.add(e.key)); };
  function exportFavs() {
    const data = { app: "gong-medical", v: 1, exportedAt: new Date().toISOString(), fav: favs, recent: recents };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date(); const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    a.href = url; a.download = `교통생활-즐겨찾기-${stamp}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function importFavs(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!d || (!Array.isArray(d.fav) && !Array.isArray(d.recent))) throw new Error("형식");
        if (Array.isArray(d.fav)) { favs = dedupeByKey([...d.fav, ...favs]); save(FAV_KEY, favs); }
        if (Array.isArray(d.recent)) { recents = dedupeByKey([...d.recent, ...recents]).slice(0, REC_CAP); save(REC_KEY, recents); }
        Object.keys(PANELS).forEach(renderBar);
        alert(`즐겨찾기를 가져왔습니다. (즐겨찾기 ${favs.length} · 최근 ${recents.length})`);
      } catch { alert("가져오기 실패: 올바른 백업 파일(JSON)이 아닙니다."); }
    };
    r.readAsText(file);
  }
  (function mountBackupBar() {
    const footer = document.querySelector(".app-footer");
    if (!footer) return;
    const bar = document.createElement("p");
    bar.className = "disclaimer fav-backup";
    bar.innerHTML = `⭐ 즐겨찾기 <button type="button" class="linkbtn" id="favExport">내보내기</button> · <button type="button" class="linkbtn" id="favImport">가져오기</button> <span class="opt">(이 브라우저 저장분 백업)</span><input type="file" id="favImportFile" accept="application/json,.json" hidden>`;
    footer.appendChild(bar);
    byId("favExport").addEventListener("click", exportFavs);
    byId("favImport").addEventListener("click", () => byId("favImportFile").click());
    byId("favImportFile").addEventListener("change", (e) => { if (e.target.files[0]) importFavs(e.target.files[0]); e.target.value = ""; });
  })();

  // ---- 공유 링크로 들어온 경우: URL의 검색조건을 복원 ----
  // 위치기반 탭인데 주소가 비어 있으면(=GPS 필요) 자동 조회는 하지 않고 채워만 둔다(로드 즉시 권한요청 방지).
  (function restoreFromUrl() {
    const sp = new URLSearchParams(location.search);
    const panel = sp.get("s");
    if (!panel || !PANELS[panel]) return;
    const cfg = PANELS[panel];
    const vals = {};
    cfg.fields.forEach((id) => { if (sp.has(id)) vals[id] = sp.get(id); });
    if (!Object.keys(vals).length) { switchPanel(panel); return; }
    // 자동 조회를 미루는 경우: ①GPS 권한이 필요한 위치탭(주소 없음) ②동적 UI(지하철 — 역 데이터 async 로드)
    const deferRun = (cfg.locKey && !String(vals[cfg.locKey] || "").trim()) || cfg.delegate;
    if (deferRun) fillEntry(panel, vals);   // 채우고 대기 — 사용자가 직접 조회
    else applyEntry(panel, vals);
  })();
})();
