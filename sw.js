// ===== 서비스워커: 오프라인 셸 + 정적 자산 캐시 =====
// 정적(HTML·CSS·JS·아이콘)은 cache-first(+백그라운드 갱신), /api 는 캐시하지 않는다
// (실시간 데이터가 stale해지면 안 됨 → 항상 네트워크, 실패 시 앱의 재시도 UI가 처리).
// 버전을 올리면 옛 캐시를 지운다.
const VERSION = "v5";
const CACHE = "gong-shell-" + VERSION;

// 콜드스타트 셸. subway-map.png(4.2MB)는 무겁고 지하철 탭에서만 쓰므로 런타임 캐시.
const PRECACHE = [
  "/",
  "/index.html",
  "/guide.html",
  "/css/style.css",
  "/js/theme.js",
  "/js/app.js",
  "/js/services.js",
  "/js/favorites.js",
  "/js/map.js",
  "/js/pwa.js",
  "/js/guide.js",
  "/icon.svg",
  "/manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // 일부 자원이 없어도 설치가 통째로 실패하지 않도록 개별 추가
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 외부(지도 타일 등)는 관여 안 함
  if (url.pathname.startsWith("/api/")) return;       // 실시간 데이터는 항상 네트워크

  // 정적 자산: 네트워크 우선, 실패(오프라인) 시에만 캐시.
  // stale-while-revalidate는 배포 직후 index.html·JS의 버전이 어긋나(version skew)
  // "일부만 최신"인 상태를 만들었다 → 온라인이면 항상 최신, 오프라인이면 캐시 셸.
  // 문서(navigate)는 HTTP 디스크 캐시의 낡은 HTML을 피하려 재검증을 강제한다.
  const netReq = req.mode === "navigate" ? new Request(req.url, { cache: "no-cache" }) : req;
  e.respondWith(
    fetch(netReq)
      .then((res) => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});

// 새 워커가 대기 중일 때 페이지가 보내는 즉시 적용 신호
self.addEventListener("message", (e) => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });
