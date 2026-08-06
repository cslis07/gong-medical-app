// 야간(저녁) 진료 병의원 스냅샷 빌더 — `node scripts/build-night-clinics.mjs`
// 국립중앙의료원 E-Gen 병의원 API(전국 8만곳, 지역/좌표 필터 없음)를 전 페이지 스캔해
// "어느 요일이든 진료 종료 >= 18:30"인 곳만 남겨 굽는다. 런타임엔 반경 필터로 사용.
// 기존 DATA_API_KEY 사용(활용신청 불필요). 원본 갱신 주기가 낮아 가끔만 재생성.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = await readFile(join(root, ".env"), "utf8");
const KEY = (env.match(/^DATA_API_KEY=(.*)$/m) || [])[1]?.trim();
if (!KEY) throw new Error("DATA_API_KEY 없음");

const BASE = "https://apis.data.go.kr/B552657/HsptlAsembySearchService/getHsptlBassInfoInqire";
const NIGHT_END = 1830;                 // 이 시각 이후 종료면 '야간(퇴근후)' 진료로 간주
const PER = 1000;
const num = (v) => { const n = Number(String(v ?? "").trim()); return Number.isFinite(n) ? n : 0; };

async function page(pageNo) {
  const url = `${BASE}?serviceKey=${encodeURIComponent(KEY)}&pageNo=${pageNo}&numOfRows=${PER}&_type=json`;
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
      const j = JSON.parse(await r.text());
      let items = j?.response?.body?.items?.item || [];
      if (!Array.isArray(items)) items = items ? [items] : [];
      return { items, total: Number(j?.response?.body?.totalCount) || 0 };
    } catch { await new Promise((res) => setTimeout(res, 500)); }
  }
  return { items: [], total: 0 };
}

const seen = new Set();
const out = [];
let total = 0;
for (let p = 1; ; p++) {
  const { items, total: t } = await page(p);
  if (t) total = t;
  if (!items.length) break;
  for (const it of items) {
    const id = it.hpid || (it.dutyName + it.dutyAddr);
    if (seen.has(id)) continue;
    const lat = Number(it.wgs84Lat), lon = Number(it.wgs84Lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const s = [1, 2, 3, 4, 5, 6, 7, 8].map((d) => num(it["dutyTime" + d + "s"]));   // 시작(월~일,공휴일)
    const e = [1, 2, 3, 4, 5, 6, 7, 8].map((d) => num(it["dutyTime" + d + "c"]));   // 종료
    if (!e.some((v) => v >= NIGHT_END)) continue;                                    // 야간 진료 없는 곳 제외
    seen.add(id);
    const r5 = (v) => Math.round(v * 1e5) / 1e5;
    const g = String(it.dgidIdName || "").split(",").slice(0, 3).join(",");   // 진료과 최대 3개
    // 컬럼형 행: [n, a, t, g, la, lo, s, e]
    out.push([String(it.dutyName || "").trim(), String(it.dutyAddr || "").trim(), String(it.dutyTel1 || "").replace(/[^0-9]/g, ""), g, r5(lat), r5(lon), s, e]);
  }
  if (p % 10 === 0) console.log(`page ${p} · 누적 야간병의원 ${out.length}`);
  if (p >= Math.ceil(total / PER) && total) break;
}

const body = `// 야간(18:30 이후 종료) 진료 병의원 스냅샷 — scripts/build-night-clinics.mjs 자동생성. 직접수정 금지.\n// 출처: 국립중앙의료원 E-Gen 병의원(공공데이터포털). 총 ${out.length}곳.\n// 컬럼형 행: [n=이름, a=주소, t=전화, g=진료과, la=위도, lo=경도, s=[월~일·공휴일 시작HHMM], e=[종료HHMM]]\nexport const generatedAt = "${new Date().toISOString().slice(0, 10)}";\nexport const COLS = ["n","a","t","g","la","lo","s","e"];\nexport const CLINICS = ${JSON.stringify(out)};\n`;
await writeFile(join(root, "data", "night-clinics.js"), body, "utf8");
console.log(`✅ data/night-clinics.js 생성 — 야간 병의원 ${out.length}곳`);
