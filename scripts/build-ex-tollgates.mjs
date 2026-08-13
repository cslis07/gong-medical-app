// 고속도로 영업소(톨게이트) 코드+이름 목록 빌더 — `node scripts/build-ex-tollgates.mjs`
// EX에 영업소 목록 전용 API가 없어, realUnitTrtm(실시간 영업소간 통행시간)을 전 페이지
// 순회하며 출발/도착 영업소를 dedup해 굽는다. 목록은 거의 불변이라 가끔만 재생성.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// 환경변수 우선, 없으면 로컬 .env (CI 에는 .env 가 없다 — build-night-clinics 와 동일 규칙)
const KEY = process.env.EX_API_KEY?.trim()
  || (await readFile(join(root, ".env"), "utf8").catch(() => "").then((e) => (e.match(/^EX_API_KEY=(.*)$/m) || [])[1]?.trim()));
if (!KEY) throw new Error("EX_API_KEY 없음");

const EX = "https://data.ex.co.kr/openapi";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36";
const page = async (pageNo) => {
  // 페이지당 라운드트립이 ~4-5초라 numOfRows 를 키워 왕복 수를 줄인다(100→1000).
  const qs = new URLSearchParams({ key: KEY, type: "json", sumTmUnitTypeCode: "3", iStartEndStdTypeCode: "2", numOfRows: "1000", pageNo: String(pageNo) });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${EX}/trtm/realUnitTrtm?${qs}`, { headers: { "User-Agent": UA, Referer: "https://data.ex.co.kr/", Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      const t = await r.text();
      return JSON.parse(t).realUnitTrtmVO || [];
    } catch { await new Promise((res) => setTimeout(res, 400)); }
  }
  return [];
};

// ⚠️ 영업소 목록은 유한(~566곳)한데 realUnitTrtm 은 «영업소 쌍»의 실시간 통행시간이라
//    페이지가 훨씬 많다. 그래서 세 가지로 조기 종료한다: ①연속 빈 페이지(데이터 끝)
//    ②새 영업소가 20페이지째 안 늘면 이미 다 모은 것(saturated) ③시간 예산 초과(안전벽).
//    이 스크립트는 월간 자동 갱신에서 «뺐다»(영업소는 거의 불변) — 수동 실행 전용이다.
//    realUnitTrtm OD 쌍이 워낙 많아 완주에 수 분 걸린다(정상). 잘리면(budget/empty)
//    기존보다 적을 때 덮어쓰지 않으니 566곳 스냅샷은 항상 안전하다.
const ic = new Map();   // code → { code, name }
const t0 = Date.now();
const BUDGET_MS = 600_000;   // 수동 전용이라 완주 우선(최대 10분)
let empty = 0, stale = 0, cutoff = "cap";
for (let p = 1; p <= 400; p++) {
  if (empty >= 2)   { cutoff = "empty";     break; }
  if (stale >= 20)  { cutoff = "saturated"; break; }
  if (Date.now() - t0 > BUDGET_MS) { cutoff = "budget"; break; }
  const rows = await page(p);
  if (!rows.length) { empty++; continue; }
  empty = 0;
  const before = ic.size;
  rows.forEach((r) => {
    const add = (c, n) => { const code = String(c || "").trim(), name = String(n || "").trim(); if (code && name && !ic.has(code)) ic.set(code, { code, name }); };
    add(r.startUnitCode, r.startUnitNm);
    add(r.endUnitCode, r.endUnitNm);
  });
  stale = ic.size > before ? 0 : stale + 1;
  if (p % 20 === 0) console.log(`page ${p} · 누적 영업소 ${ic.size}`);
}

const list = [...ic.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));

// ⚠️ 예산/빈페이지로 잘려 «불완전»할 수 있다. 불완전한 목록으로 기존 스냅샷을 덮으면
//    드롭다운에서 영업소가 사라진다 → 기존보다 눈에 띄게 적으면 덮지 않는다(기존 유지).
let prevCount = 0;
try { prevCount = ((await readFile(join(root, "data", "ex-tollgates.js"), "utf8")).match(/"code":/g) || []).length; } catch {}
if (cutoff !== "saturated" && list.length < prevCount * 0.9) {
  console.warn(`⚠️ 조기 종료(${cutoff})로 ${list.length}곳 < 기존 ${prevCount}곳 — 불완전 판단, 기존 스냅샷 유지(덮어쓰지 않음).`);
  process.exit(0);
}
const out = `// 고속도로 영업소(톨게이트) 목록 — scripts/build-ex-tollgates.mjs 자동생성. 직접 수정 금지.\n// EX realUnitTrtm에서 dedup. 총 ${list.length}곳.\nexport const TOLLGATES = ${JSON.stringify(list)};\n`;
await writeFile(join(root, "data", "ex-tollgates.js"), out, "utf8");
console.log(`✅ data/ex-tollgates.js 생성 — 영업소 ${list.length}곳 (종료: ${cutoff})`);
