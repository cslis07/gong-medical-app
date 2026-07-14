// ===== 지도 뷰 (Leaflet, 로컬 벤더링) =====
// 위치 기반 결과(주유소·따릉이·시내버스·주차장)를 실제 지도에 핀으로 찍는다.
// CSP가 default-src 'self'라 Leaflet은 /vendor/leaflet/에 벤더링해 self로 로드하고,
// OSM 타일 도메인만 vercel.json img-src에 예외로 열었다. 타일은 사용자 브라우저가
// 직접 받으므로 Vercel 데이터센터 IP 차단과 무관하다.
// Leaflet(148KB)은 지도를 처음 열 때만 지연 로드한다.

(function () {
  const PANELS = {
    gas:     "gasResults",
    bike:    "bikeResults",
    citybus: "cbResults",
    parking: "pkResults",
  };
  const state = {};           // panel -> { points, center, map, layer, open }
  let leafletP = null;

  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletP) return leafletP;
    leafletP = new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/vendor/leaflet/leaflet.css";
      document.head.appendChild(link);
      const s = document.createElement("script");
      s.src = "/vendor/leaflet/leaflet.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("지도 로드 실패"));
      document.head.appendChild(s);
    });
    return leafletP;
  }

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function markerIcon(kind, n) {
    return window.L.divIcon({
      className: "",
      html: `<span class="map-marker ${kind === "me" ? "mm-me" : "mm-pt"}">${kind === "me" ? "" : n || ""}</span>`,
      iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -13],
    });
  }

  // 결과 영역 앞에 [지도 보기] 토글 + 지도 컨테이너를 한 번만 주입
  function ensureUI(panel) {
    const results = byId(PANELS[panel]);
    if (!results || byId("maptoggle-" + panel)) return;
    const bar = document.createElement("div");
    bar.className = "map-toggle-bar";
    bar.innerHTML = `<button id="maptoggle-${panel}" class="map-toggle" type="button" hidden>🗺️ 지도 보기</button>`;
    results.parentNode.insertBefore(bar, results);
    const wrap = document.createElement("div");
    wrap.className = "svc-map";
    wrap.id = "svcmap-" + panel;
    wrap.style.display = "none";
    results.parentNode.insertBefore(wrap, results);
    byId("maptoggle-" + panel).addEventListener("click", () => toggle(panel));
  }

  function toggle(panel) {
    const st = state[panel]; if (!st) return;
    st.open = !st.open;
    const wrap = byId("svcmap-" + panel);
    const btn = byId("maptoggle-" + panel);
    if (st.open) { wrap.style.display = "block"; btn.textContent = "🗺️ 지도 닫기"; render(panel); }
    else { wrap.style.display = "none"; btn.textContent = "🗺️ 지도 보기"; }
  }

  async function render(panel) {
    const st = state[panel];
    if (!st || !st.points || !st.points.length) return;
    const el = byId("svcmap-" + panel);
    try { await loadLeaflet(); }
    catch { el.innerHTML = `<p class="status warn" style="padding:14px">지도를 불러오지 못했습니다. 잠시 후 다시 시도하세요.</p>`; return; }
    const L = window.L;
    if (!st.map) {
      st.map = L.map(el, { scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      }).addTo(st.map);
      st.layer = L.layerGroup().addTo(st.map);
    }
    st.layer.clearLayers();
    const bounds = [];
    if (st.center && Number.isFinite(st.center.lat) && Number.isFinite(st.center.lon)) {
      L.marker([st.center.lat, st.center.lon], { icon: markerIcon("me") }).bindPopup("📍 내 위치").addTo(st.layer);
      bounds.push([st.center.lat, st.center.lon]);
    }
    st.points.forEach((p, i) => {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return;
      L.marker([p.lat, p.lon], { icon: markerIcon("pt", i + 1) })
        .bindPopup(`<b>${esc(p.label)}</b>${p.sub ? "<br>" + esc(p.sub) : ""}`)
        .addTo(st.layer);
      bounds.push([p.lat, p.lon]);
    });
    st.map.invalidateSize();
    if (bounds.length) st.map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
    // 컨테이너가 방금 보여진 직후엔 크기 계산이 어긋나 타일이 회색으로 남을 수 있다.
    // 다음 프레임에 한 번 더 보정한다.
    setTimeout(() => { if (st.map) { st.map.invalidateSize(); if (bounds.length) st.map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 }); } }, 120);
  }

  // 각 검색 함수가 결과 렌더 후 호출한다.
  window.GongMap = {
    set(panel, points, center) {
      if (!PANELS[panel]) return;
      ensureUI(panel);
      const st = state[panel] || (state[panel] = { open: false });
      st.points = (points || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      st.center = center || null;
      const btn = byId("maptoggle-" + panel);
      if (btn) btn.hidden = st.points.length === 0;
      // 결과가 비어 토글이 사라지면 열린 지도도 접는다
      if (st.points.length === 0 && st.open) toggle(panel);
      else if (st.open) render(panel);
    },
  };
})();
