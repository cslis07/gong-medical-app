// 고속도로 영업소(톨게이트) 코드+이름 목록 빌더 — `node scripts/build-ex-tollgates.mjs`
// EX에 영업소 목록 전용 API가 없어, realUnitTrtm(실시간 영업소간 통행시간)을 전 페이지
// 순회하며 출발/도착 영업소를 dedup해 굽는다. 목록은 거의 불변이라 가끔만 재생성.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = await readFile(join(root, ".env"), "utf8");
const KEY = (env.match(/^EX_API_KEY=(.*)$/m) || [])[1]?.trim();
if (!KEY) throw new Error("EX_API_KEY 없음");

const EX = "https://data.ex.co.kr/openapi";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36";
const page = async (pageNo) => {
  const qs = new URLSearchParams({ key: KEY, type: "json", sumTmUnitTypeCode: "3", iStartEndStdTypeCode: "2", numOfRows: "100", pageNo: String(pageNo) });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${EX}/trtm/realUnitTrtm?${qs}`, { headers: { "User-Agent": UA, Referer: "https://data.ex.co.kr/", Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      const t = await r.text();
      return JSON.parse(t).realUnitTrtmVO || [];
    } catch { await new Promise((res) => setTimeout(res, 400)); }
  }
  return [];
};

const ic = new Map();   // code → { code, name }
let empty = 0;
for (let p = 1; p <= 400 && empty < 2; p++) {
  const rows = await page(p);
  if (!rows.length) { empty++; continue; }
  empty = 0;
  rows.forEach((r) => {
    const add = (c, n) => { const code = String(c || "").trim(), name = String(n || "").trim(); if (code && name && !ic.has(code)) ic.set(code, { code, name }); };
    add(r.startUnitCode, r.startUnitNm);
    add(r.endUnitCode, r.endUnitNm);
  });
  if (p % 20 === 0) console.log(`page ${p} · 누적 영업소 ${ic.size}`);
}

const list = [...ic.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
const out = `// 고속도로 영업소(톨게이트) 목록 — scripts/build-ex-tollgates.mjs 자동생성. 직접 수정 금지.\n// EX realUnitTrtm에서 dedup. 총 ${list.length}곳.\nexport const TOLLGATES = ${JSON.stringify(list)};\n`;
await writeFile(join(root, "data", "ex-tollgates.js"), out, "utf8");
console.log(`✅ data/ex-tollgates.js 생성 — 영업소 ${list.length}곳`);
