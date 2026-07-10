// 한국교통안전공단 주차정보 제공 API (data.go.kr B553881/Parking) — 전국 실시간 주차면수.
//   PrkSttusInfo    시설정보(이름·주소·좌표·총구획수)
//   PrkOprInfo      운영정보(요일별 운영시간·기본/추가요금·일일권)
//   PrkRealtimeInfo 실시간(총 구획수·주차가능 구획수)
// 셋 다 prk_center_id로 join한다. 위치·지역 필터가 없어 전량 페이징만 가능하다.
//
// ⚠️ 표준데이터(tn_pubr_prkplce_info_api)의 prkplceNo와 prk_center_id는 **서로 다른 체계**라
//    두 소스를 ID로 join할 수 없다. 그래서 공단 실시간을 쓰려면 공단 시설정보(좌표)도 함께 있어야 한다.
//    → 시설·운영은 빌드 타임 스냅샷(data/parking-kotsa.js), 실시간만 런타임 조회.
//
// ⚠️ 2026-07-10 현재 제공기관 백엔드가 죽어 있다("Error forwarding request to backend server").
//    위조키는 Unauthorized가 나오는데 정상키는 이 메시지가 나오므로 게이트웨이 인증은 통과한 것이고,
//    공단 서버가 응답을 못 하는 상태다(심의 승인 문제가 아니다).
//    따라서 이 모듈은 실패를 정상 경로로 취급한다. 백엔드가 살아나면 자동으로 값이 붙는다.

const BASE = "http://apis.data.go.kr/B553881/Parking";

async function getPage(op, pageNo, key, perPage, signal) {
  const url = `${BASE}/${op}?serviceKey=${key}&numOfRows=${perPage}&pageNo=${pageNo}&format=2`;
  const r = await fetch(url, { signal });
  const t = await r.text();
  // 백엔드 장애 시 JSON이 아니라 평문("Error forwarding…")이나 XML 오류가 온다.
  if (!t.trim().startsWith("{")) throw new Error(t.trim().slice(0, 120) || `HTTP ${r.status}`);
  return JSON.parse(t);
}

const asRows = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/** 한 오퍼레이션을 전량 페이징. 예산(budgetMs) 안에서만 돌고, 실패하면 throw. */
export async function fetchAll(op, { key, perPage = 1000, maxPages = 40, budgetMs = 60_000, signal } = {}) {
  const ctl = signal ? null : new AbortController();
  const sig = signal || ctl.signal;
  const timer = ctl ? setTimeout(() => ctl.abort(), budgetMs) : null;
  try {
    const rows = [];
    let total = Infinity;
    for (let page = 1; page <= maxPages && rows.length < total; page++) {
      const j = await getPage(op, page, key, perPage, sig);
      total = Number(j.totalCount) || 0;
      const got = asRows(j[op]);
      if (!got.length) break;
      rows.push(...got);
    }
    return rows;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---------- 런타임: 실시간 오버레이 ----------

const TTL_OK_MS = 60_000;      // 성공 캐시
const TTL_DOWN_MS = 300_000;   // 실패 캐시 — 죽은 백엔드를 매 요청 두드리지 않는다
let cache = { at: 0, map: null, status: "idle" };

/**
 * prk_center_id → {capacity, available} 맵. 백엔드 장애·타임아웃이면 null.
 * 켜기: 환경변수 KOTSA_PARKING=1 (기본 off)
 */
export async function fetchRealtimeMap() {
  const key = process.env.DATA_API_KEY;
  if (!key || process.env.KOTSA_PARKING !== "1") return null;

  const now = Date.now();
  const ttl = cache.map ? TTL_OK_MS : TTL_DOWN_MS;
  if (cache.at && now - cache.at < ttl) return cache.map;

  try {
    const rows = await fetchAll("PrkRealtimeInfo", { key, maxPages: 30, budgetMs: 6000 });
    const map = new Map();
    for (const r of rows) {
      const id = String(r.prk_center_id || "").trim();
      if (!id) continue;
      // 문서 JSON 예제에 pkfc-ParkingLots-total(하이픈) 오타가 섞여 있어 둘 다 본다.
      const cap = Number(r.pkfc_ParkingLots_total ?? r["pkfc-ParkingLots-total"]);
      const avail = Number(r.pkfc_Available_ParkingLots_total);
      map.set(id, {
        capacity: Number.isFinite(cap) && cap > 0 ? cap : null,
        available: Number.isFinite(avail) && avail >= 0 ? avail : null,
      });
    }
    cache = { at: now, map, status: `ok(${map.size})` };
    return map;
  } catch (e) {
    const msg = e?.name === "AbortError" ? "timeout" : String(e?.message || e);
    cache = { at: now, map: null, status: `down: ${msg}` };
    return null;
  }
}

export const cacheStatus = () => cache.status;

/** /api/parking?diag=1 진단용 — 재배포 없이 백엔드 회복 여부를 확인한다. */
export async function probe() {
  const key = process.env.DATA_API_KEY;
  if (!key) return { enabled: false, reason: "DATA_API_KEY 없음" };
  const out = { enabled: process.env.KOTSA_PARKING === "1", cacheStatus: cache.status, ops: {} };
  for (const op of ["PrkSttusInfo", "PrkOprInfo", "PrkRealtimeInfo"]) {
    try {
      const j = await getPage(op, 1, key, 1, AbortSignal.timeout(8000));
      out.ops[op] = { ok: true, totalCount: Number(j.totalCount) || 0 };
    } catch (e) {
      out.ops[op] = { ok: false, error: String(e?.message || e).slice(0, 120) };
    }
  }
  out.alive = Object.values(out.ops).every((o) => o.ok);
  return out;
}
