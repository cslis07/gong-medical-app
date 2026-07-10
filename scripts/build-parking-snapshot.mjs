// 주차장 스냅샷 2종을 굽는다.
//   data/parking-nationwide.js  전국주차장정보표준데이터 (18,500여곳)
//   data/parking-kotsa.js       한국교통안전공단 B553881/Parking 시설+운영 (실시간 join용 좌표)
//   실행: DATA_API_KEY=... node scripts/build-parking-snapshot.mjs
//
// 왜 스냅샷인가: 두 API 모두 위치 필터가 없어 전량 페이징만 가능한데
// 표준데이터 개발계정 일일 트래픽이 1,000회다(전량 1회 = 38페이지).
// 요청마다 호출하면 콜드스타트 스물몇 번에 한도가 소진된다. 원본 갱신주기도 일 1회다.

import { writeFileSync, mkdirSync } from "node:fs";
import { fetchAll } from "../lib/kotsa-parking.js";

const KEY = process.env.DATA_API_KEY;
const URL_BASE = "https://api.data.go.kr/openapi/tn_pubr_prkplce_info_api";
const PER_PAGE = 500;   // 1000행 페이지는 30초를 넘겨 타임아웃난다.

if (!KEY) { console.error("DATA_API_KEY 환경변수가 필요합니다."); process.exit(1); }

const N = (v) => { const n = Number(v); return Number.isFinite(n) && n !== 0 ? n : null; };
const S = (v) => String(v ?? "").trim();
// 표준데이터는 "08:00" 형태로 오지만 "0800"·"8:00" 등 지자체별 편차가 있다.
const hhmm = (v) => {
  const s = S(v).replace(/[^0-9:]/g, "");
  if (/^\d{1,2}:\d{2}$/.test(s)) return s.padStart(5, "0");
  if (/^\d{4}$/.test(s)) return `${s.slice(0, 2)}:${s.slice(2)}`;
  return "";
};
const span = (a, b) => { const x = hhmm(a), y = hhmm(b); return x && y ? `${x}~${y}` : ""; };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(pageNo, attempt = 1) {
  const url = `${URL_BASE}?serviceKey=${KEY}&pageNo=${pageNo}&numOfRows=${PER_PAGE}&type=json`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
    const t = await r.text();
    let j;
    try { j = JSON.parse(t); } catch { throw new Error(`JSON 아님 — ${t.slice(0, 200)}`); }
    const head = j?.response?.header;
    if (head?.resultCode === "03") return { items: [], total: 0, done: true };  // NODATA — 마지막 페이지 다음
    if (head?.resultCode !== "00") throw new Error(`${head?.resultCode} ${head?.resultMsg}`);
    const body = j.response.body;
    return { items: body.items || [], total: Number(body.totalCount) || 0 };
  } catch (e) {
    if (attempt >= 3) throw new Error(`page ${pageNo} 실패(${attempt}회): ${e.message}`);
    console.warn(`  page ${pageNo} 재시도 ${attempt} — ${e.message}`);
    await sleep(2000 * attempt);
    return fetchPage(pageNo, attempt + 1);
  }
}

function normalize(r) {
  const lat = N(r.latitude), lon = N(r.longitude);
  // 좌표 없는 행(전체의 약 4%)은 거리 정렬을 못 하므로 버린다.
  if (!lat || !lon || lat < 33 || lat > 39 || lon < 124 || lon > 132) return null;
  const chrg = S(r.parkingchrgeInfo);
  return {
    name: S(r.prkplceNm),
    addr: S(r.rdnmadr) || S(r.lnmadr),
    tel: S(r.phoneNumber),
    kind: S(r.prkplceType),   // 노상 / 노외 / 부설
    oper: S(r.prkplceSe),     // 공영 / 민영
    free: chrg.includes("무료"),
    capacity: N(r.prkcmprt),
    rate: N(r.basicCharge), rateMin: N(r.basicTime),
    addRate: N(r.addUnitCharge), addMin: N(r.addUnitTime),
    dailyMax: N(r.dayCmmtkt),
    wd: span(r.weekdayOperOpenHhmm, r.weekdayOperColseHhmm),
    we: span(r.satOperOperOpenHhmm, r.satOperCloseHhmm) || span(r.holidayOperOpenHhmm, r.holidayCloseOpenHhmm),
    lat, lon,
  };
}

const rows = [];
let total = Infinity, seen = 0;   // seen = 수신 건수. 좌표 없는 행을 버리므로 rows.length로 세면 끝나지 않는다.
for (let page = 1; seen < total; page++) {
  const { items, total: t, done } = await fetchPage(page);
  if (done || !items.length) break;
  total = t;
  seen += items.length;
  for (const it of items) { const n = normalize(it); if (n) rows.push(n); }
  console.log(`page ${page}: 수신 ${seen} / ${total} · 좌표 있는 ${rows.length}`);
  if (page > 60) throw new Error("페이지 상한 초과 — totalCount 확인 필요");
}
if (seen < total) console.warn(`⚠️ 수신 ${seen} < totalCount ${total} — 일부 페이지 누락 가능`);

// null·""·false 키는 빼서 굽는다(4.7MB → 3.7MB). 읽는 쪽에서 기본값을 채운다.
const compact = rows.map((r) => {
  const o = {};
  for (const [k, v] of Object.entries(r)) { if (v === null || v === "" || v === false) continue; o[k] = v; }
  return o;
});

mkdirSync("data", { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const out =
  `// 자동 생성 — scripts/build-parking-snapshot.mjs (${stamp})\n` +
  `// 출처: 공공데이터포털 전국주차장정보표준데이터 (원본 ${total}건 중 좌표 있는 ${rows.length}건)\n` +
  `// null·빈문자·false 키는 생략됨. 소비자(lib/parking.js)가 기본값을 채운다.\n` +
  `export const generatedAt = ${JSON.stringify(stamp)};\n` +
  `export const sourceTotal = ${total};\n` +
  `export default ${JSON.stringify(compact)};\n`;
writeFileSync("data/parking-nationwide.js", out);
console.log(`\n✅ data/parking-nationwide.js — ${rows.length}곳 (${(out.length / 1e6).toFixed(2)} MB)`);

// ---------- 2단계: 교통안전공단 시설+운영 스냅샷 ----------
// 실시간(PrkRealtimeInfo)은 prk_center_id만 주므로 좌표·이름을 가진 시설정보가 함께 있어야 쓸 수 있다.
// 백엔드가 죽어 있으면 빈 스냅샷을 남기고 넘어간다 — 표준데이터 스냅샷은 이미 성공했으므로 빌드를 깨지 않는다.

const timeStr = (v) => { const s = S(v).replace(/[^0-9]/g, ""); return s.length >= 4 ? `${s.slice(0, 2)}:${s.slice(2, 4)}` : ""; };

async function buildKotsa() {
  const [sttus, opr] = await Promise.all([
    fetchAll("PrkSttusInfo", { key: KEY, budgetMs: 120_000, maxPages: 60 }),
    fetchAll("PrkOprInfo", { key: KEY, budgetMs: 120_000, maxPages: 60 }),
  ]);
  const oprMap = new Map(opr.map((o) => [String(o.prk_center_id), o]));
  const out = [];
  for (const f of sttus) {
    const lat = N(f.prk_plce_entrc_la), lon = N(f.prk_plce_entrc_lo);
    if (!lat || !lon || lat < 33 || lat > 39 || lon < 124 || lon > 132) continue;
    const o = oprMap.get(String(f.prk_center_id)) || {};
    const basic = o.basic_info || {}, fx = o.fxamt_info || {};
    const wdOpen = timeStr(o.Monday?.opertn_start_time), wdClose = timeStr(o.Monday?.opertn_end_time);
    const weOpen = timeStr(o.Saturday?.opertn_start_time), weClose = timeStr(o.Saturday?.opertn_end_time);
    out.push({
      id: String(f.prk_center_id),
      name: S(f.prk_plce_nm),
      addr: S(f.prk_plce_adres),
      capacity: N(f.prk_cmprt_co),
      rate: N(basic.parking_chrge_bs_chrge ?? basic.parking_chrge_bs_chrg),  // 문서 표/예제 철자가 엇갈린다
      rateMin: N(basic.parking_chrge_bs_time),
      addRate: N(basic.parking_chrge_adit_unit_chrge), addMin: N(basic.parking_chrge_adit_unit_time),
      dailyMax: N(fx.parking_chrge_one_day_chrge),
      wd: wdOpen && wdClose ? `${wdOpen}~${wdClose}` : "",
      we: weOpen && weClose ? `${weOpen}~${weClose}` : "",
      lat, lon,
    });
  }
  return out;
}

let kotsa = [], kotsaNote = "";
try {
  kotsa = await buildKotsa();
  kotsaNote = `시설 ${kotsa.length}곳`;
  console.log(`✅ 공단 시설+운영 — ${kotsa.length}곳`);
} catch (e) {
  kotsaNote = String(e?.message || e).slice(0, 160);
  console.warn(`⚠️ 공단 API 수집 실패 — ${kotsaNote}\n   (빈 스냅샷을 남긴다. 백엔드 회복 후 재실행)`);
}
const kOut =
  `// 자동 생성 — scripts/build-parking-snapshot.mjs (${stamp})\n` +
  `// 한국교통안전공단 B553881/Parking 시설+운영 스냅샷 (prk_center_id 기준, 실시간 join용).\n` +
  `export const generatedAt = ${JSON.stringify(stamp)};\n` +
  `export const alive = ${kotsa.length > 0};\n` +
  `export const note = ${JSON.stringify(kotsaNote)};\n` +
  `export default ${JSON.stringify(kotsa)};\n`;
writeFileSync("data/parking-kotsa.js", kOut);
