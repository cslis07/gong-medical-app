// PWA 아이콘·OG 이미지 빌더 — `node scripts/build-assets.mjs`
// icon.svg를 원본으로 192/512/애플터치 PNG를 굽고, OG(1200×630) 이미지를 SVG로 그려 래스터화한다.
// sharp(devDependency)의 librsvg가 시스템 폰트(Malgun Gothic)로 한글을 렌더링한다.
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const icon = await readFile(join(root, "icon.svg"));

// ---- PWA 아이콘 ----
for (const size of [192, 512]) {
  await sharp(icon).resize(size, size).png().toFile(join(root, `icon-${size}.png`));
  console.log(`icon-${size}.png OK`);
}
await sharp(icon).resize(180, 180).png().toFile(join(root, "apple-touch-icon.png"));
console.log("apple-touch-icon.png OK");

// ---- OG 이미지 (1200×630) ----
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3b6ef5"/><stop offset="1" stop-color="#22409e"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <!-- 우측 지하철 글리프 (icon.svg와 동일 모티프) -->
  <g transform="translate(830,120) scale(0.62)" opacity="0.92">
    <rect x="146" y="120" width="220" height="230" rx="46" fill="#ffffff"/>
    <rect x="176" y="158" width="160" height="70" rx="18" fill="#2b56d4"/>
    <circle cx="196" cy="292" r="20" fill="#2b56d4"/>
    <circle cx="316" cy="292" r="20" fill="#2b56d4"/>
    <rect x="176" y="356" width="30" height="44" rx="8" fill="#ffffff"/>
    <rect x="306" y="356" width="30" height="44" rx="8" fill="#ffffff"/>
    <line x1="120" y1="408" x2="392" y2="408" stroke="#ffffff" stroke-width="14" stroke-linecap="round"/>
  </g>
  <g font-family="Malgun Gothic, sans-serif" fill="#ffffff">
    <text x="80" y="230" font-size="76" font-weight="bold">서울 교통·생활 정보</text>
    <text x="80" y="310" font-size="34" opacity="0.92">지하철 실시간 · 혼잡도 · 주차장 · 주유소</text>
    <text x="80" y="360" font-size="34" opacity="0.92">아파트 실거래가 · 미세먼지 · 시내버스 · LH청약</text>
    <text x="80" y="455" font-size="27" opacity="0.75">공공데이터로 한 번에 — 회원가입 없이 무료</text>
  </g>
  <rect x="80" y="490" width="430" height="58" rx="29" fill="#ffffff" opacity="0.14"/>
  <text x="104" y="528" font-family="Malgun Gothic, sans-serif" font-size="26" fill="#ffffff">gong-medical-app.vercel.app</text>
</svg>`;
await sharp(Buffer.from(og)).png().toFile(join(root, "og-image.png"));
console.log("og-image.png OK");
