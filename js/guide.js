// guide.html 전용 스크립트.
// CSP(script-src 'self')를 걸기 위해 인라인 <script>와 onclick 속성을 여기로 옮겼다.

const drawer = document.getElementById("toc-drawer");
const openDrawer = () => drawer?.classList.add("open");
const closeDrawer = () => drawer?.classList.remove("open");

document.querySelector(".toc-fab")?.addEventListener("click", openDrawer);
document.querySelector(".toc-drawer-close")?.addEventListener("click", closeDrawer);
// 바깥(오버레이) 클릭으로 닫기 — 패널 내부 클릭은 무시
drawer?.addEventListener("click", (e) => { if (e.target === drawer) closeDrawer(); });
// 목차 링크를 누르면 닫기
document.querySelectorAll(".toc-drawer-panel a").forEach((a) => a.addEventListener("click", closeDrawer));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

// 스크롤-스파이
(() => {
  const links = document.querySelectorAll('.sidebar-link[href^="#sec-"]');
  const sections = [...links].map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  function update() {
    const y = window.scrollY + 110;
    let cur = sections[0];
    for (const s of sections) { if (s.offsetTop <= y) cur = s; }
    if (!cur) return;
    links.forEach((l) => l.classList.toggle("active", l.getAttribute("href") === "#" + cur.id));
  }
  window.addEventListener("scroll", update, { passive: true });
  update();
})();
