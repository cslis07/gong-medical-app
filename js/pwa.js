// ===== PWA 부트스트랩: 서비스워커 등록 + 설치 버튼 =====
(function () {
  if (!("serviceWorker" in navigator)) return;
  const secure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (!secure) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      // 새 버전 감지 → 하단에 "새 버전 업데이트" 배너
      const notify = (worker) => {
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdateBanner(worker);
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg.waiting);
      reg.addEventListener("updatefound", () => notify(reg.installing));
    }).catch((e) => console.warn("SW 등록 실패", e));
    // 새 워커가 제어권을 잡으면 1회 새로고침
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; location.reload(); } });
  });

  function showUpdateBanner(worker) {
    if (document.getElementById("swUpdate")) return;
    const bar = document.createElement("div");
    bar.id = "swUpdate";
    bar.className = "sw-update";
    bar.innerHTML = `<span>🆕 새 버전이 있습니다.</span><button type="button" id="swUpdateBtn">업데이트</button>`;
    document.body.appendChild(bar);
    document.getElementById("swUpdateBtn").addEventListener("click", () => { bar.remove(); worker.postMessage("SKIP_WAITING"); });
  }

  // 브라우저가 설치 가능하다고 판단하면 헤더 옆에 "앱 설치" 버튼을 띄운다.
  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    showInstallBtn();
  });
  window.addEventListener("appinstalled", () => { deferred = null; removeInstallBtn(); });

  function showInstallBtn() {
    if (document.getElementById("installBtn")) return;
    const host = document.querySelector(".header-links");
    if (!host) return;
    const btn = document.createElement("button");
    btn.id = "installBtn";
    btn.type = "button";
    btn.className = "install-btn";
    btn.textContent = "⬇️ 앱 설치";
    btn.title = "홈 화면에 앱으로 설치";
    btn.addEventListener("click", async () => {
      if (!deferred) return;
      deferred.prompt();
      try { await deferred.userChoice; } catch {}
      deferred = null;
      removeInstallBtn();
    });
    // 테마 토글 앞에 끼워 넣는다
    const anchor = document.getElementById("themeToggle");
    if (anchor) host.insertBefore(btn, anchor); else host.appendChild(btn);
  }
  function removeInstallBtn() { document.getElementById("installBtn")?.remove(); }
})();
