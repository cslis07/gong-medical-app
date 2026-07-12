// 테마 부트스트랩 — <head>에서 동기 로드해 첫 페인트 전에 data-theme를 적용한다(FOUC 방지).
// CSP(script-src 'self')라 인라인 <script>를 못 쓰므로 외부 파일로 둔다.
// 값: "light" | "dark" | "auto"(속성 없음 → prefers-color-scheme 따름).
(function () {
  var KEY = "theme";
  var root = document.documentElement;

  function apply(mode) {
    if (mode === "light" || mode === "dark") root.setAttribute("data-theme", mode);
    else root.removeAttribute("data-theme"); // auto
  }
  var saved;
  try { saved = localStorage.getItem(KEY); } catch (e) { saved = null; }
  apply(saved || "auto");

  // 버튼 배선은 DOM 준비 후. auto → light → dark → auto 순환.
  function wire() {
    var btn = document.getElementById("themeToggle");
    if (!btn) return;
    var order = ["auto", "light", "dark"];
    var icon = { auto: "🌗", light: "☀️", dark: "🌙" };
    var label = { auto: "테마: 자동", light: "테마: 라이트", dark: "테마: 다크" };
    function cur() { try { return localStorage.getItem(KEY) || "auto"; } catch (e) { return "auto"; } }
    function render() {
      var m = cur();
      btn.textContent = icon[m];
      btn.setAttribute("aria-label", label[m] + " (클릭하여 변경)");
      btn.title = label[m];
    }
    btn.addEventListener("click", function () {
      var next = order[(order.indexOf(cur()) + 1) % order.length];
      try { localStorage.setItem(KEY, next); } catch (e) {}
      apply(next);
      render();
    });
    render();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
