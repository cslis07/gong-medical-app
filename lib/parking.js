// Vercel Serverless Function — 근처 주차장 (전국)
//
// 소스 3종을 거리순으로 병합한다.
//   1) 서울 열린데이터(SEOUL_API_KEY) — 서울 공영주차장 + 실시간 주차대수. 유일하게 실시간이 확실히 도는 소스.
//        GetParkInfo    : 서울 공영주차장 전체(2,200여행 / 고유 852곳) — 좌표·요금·운영시간·총구획수
//        GetParkingInfo : 실시간 주차대수 제공 주차장(120여곳) — NOW_PRK_VHCL_CNT
//   2) 전국주차장정보표준데이터 스냅샷(data/parking-nationwide.js) — 전국 17,700여곳. 실시간 없음.
//   3) 한국교통안전공단 스냅샷(data/parking-kotsa.js) + 런타임 실시간 오버레이 — 현재 백엔드 장애로 비어 있음.
//
// 왜 2·3이 스냅샷인가: 두 API 모두 위치 필터가 없어 전량 페이징만 가능한데 일일 트래픽이 1,000회다.
//   → scripts/build-parking-snapshot.mjs 로 빌드 때 굽는다. 갱신은 스크립트 재실행 + 재배포.
//
// 진단: /api/parking?diag=1 — 각 소스 상태와 공단 백엔드 회복 여부를 재배포 없이 확인.

import KOTSA, { alive as kotsaAlive, note as kotsaNote } from "../data/parking-kotsa.js";
import { fetchRealtimeMap, probe as kotsaProbe, cacheStatus as kotsaCacheStatus } from "./kotsa-parking.js";
import { errorMessage } from "./respond.js";

// 전국 스냅샷(4.5MB)은 이 핸들러가 실제로 불릴 때만 로드한다.
// 최상위 import로 두면 라우터를 거치는 모든 요청의 콜드스타트에서 파싱된다.
// 람다 인스턴스 안에서는 모듈 캐시가 유지되므로 두 번째 요청부터는 비용이 없다.
let _snapshot = null;
async function nationwide() {
  if (!_snapshot) _snapshot = await import("../data/parking-nationwide.js");
  return _snapshot;
}

const BASE = "http://openapi.seoul.go.kr:8088";

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(13000) });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return {}; }
}
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const N = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const hhmm = (v) => { const s = String(v ?? "").padStart(4, "0"); return /^\d{4}$/.test(s) ? `${s.slice(0, 2)}:${s.slice(2)}` : ""; };

// ---------- 1) 서울 실시간 소스 ----------

async function seoulRows(KEY, lat, lon) {
  const [p1, p2, p3, rt] = await Promise.all([
    getJson(`${BASE}/${KEY}/json/GetParkInfo/1/1000/`),
    getJson(`${BASE}/${KEY}/json/GetParkInfo/1001/2000/`),
    getJson(`${BASE}/${KEY}/json/GetParkInfo/2001/3000/`),
    getJson(`${BASE}/${KEY}/json/GetParkingInfo/1/300/`),
  ]);
  const all = [];
  for (const p of [p1, p2, p3]) { const l = p?.GetParkInfo?.row; if (Array.isArray(l)) all.push(...l); }
  if (!all.length) return { rows: [], liveCount: 0, ok: false };

  // 실시간 주차대수 인덱스 — 갱신시각이 있는 행만 신뢰(123행 중 14행은 갱신시각이 빈 값)
  const rtMap = new Map();
  for (const r of rt?.GetParkingInfo?.row || []) {
    if (String(r.NOW_PRK_VHCL_UPDT_TM || "").trim()) rtMap.set(String(r.PKLT_CD), r);
  }

  // 노상주차장은 구획(1면)마다 행이 하나씩이라 PKLT_CD로 묶어 총 면수를 합산한다.
  // (실측: 다중행 그룹 65개는 전부 TPKCT=1, 큰 값 중복 그룹은 0개)
  const groups = new Map();
  for (const p of all) {
    const plat = N(p.LAT), plon = N(p.LOT);
    if (!plat || !plon || plat < 33 || plon < 124) continue;
    const cd = String(p.PKLT_CD);
    const dist = Math.round(haversine(lat, lon, plat, plon));
    const g = groups.get(cd);
    if (!g) groups.set(cd, { p, cap: N(p.TPKCT) || 0, lat: plat, lon: plon, distance: dist });
    else {
      g.cap += N(p.TPKCT) || 0;
      if (dist < g.distance) { g.distance = dist; g.lat = plat; g.lon = plon; }  // 가장 가까운 구획 좌표
    }
  }

  const rows = [...groups.entries()].map(([cd, g]) => {
    const p = g.p, cap = g.cap || null;
    const live = rtMap.get(cd);
    const now = live ? N(live.NOW_PRK_VHCL_CNT) : null;
    return {
      source: "seoul",
      name: p.PKLT_NM, addr: p.ADDR, tel: p.TELNO || "",
      kind: p.PKLT_KND_NM || "", oper: p.OPER_SE_NM || "",
      free: String(p.CHGD_FREE_NM || "").includes("무료"),
      capacity: cap,
      nowCnt: now, available: live && cap != null && now != null ? Math.max(0, cap - now) : null,
      updatedAt: live ? live.NOW_PRK_VHCL_UPDT_TM : "",
      rate: N(p.PRK_CRG), rateMin: N(p.PRK_HM),
      addRate: N(p.ADD_CRG), addMin: N(p.ADD_UNIT_TM_MNT),
      dailyMax: N(p.DLY_MAX_CRG),
      wd: [hhmm(p.WD_OPER_BGNG_TM), hhmm(p.WD_OPER_END_TM)].filter(Boolean).join("~"),
      we: [hhmm(p.WE_OPER_BGNG_TM), hhmm(p.WE_OPER_END_TM)].filter(Boolean).join("~"),
      lat: g.lat, lon: g.lon, distance: g.distance,
    };
  });
  return { rows, liveCount: rtMap.size, ok: true };
}

// ---------- 2) 전국 표준데이터 스냅샷 ----------
// 스냅샷은 null/""/false 키를 생략해 구웠으므로 여기서 기본값을 채운다.

function nationwideRows(rows, lat, lon) {
  const out = [];
  for (const p of rows) {
    out.push({
      source: "nationwide",
      name: p.name, addr: p.addr, tel: p.tel || "",
      kind: p.kind || "", oper: p.oper || "",
      free: p.free === true,
      capacity: p.capacity ?? null,
      nowCnt: null, available: null, updatedAt: "",
      rate: p.rate ?? null, rateMin: p.rateMin ?? null,
      addRate: p.addRate ?? null, addMin: p.addMin ?? null,
      dailyMax: p.dailyMax ?? null,
      wd: p.wd || "", we: p.we || "",
      lat: p.lat, lon: p.lon, distance: Math.round(haversine(lat, lon, p.lat, p.lon)),
    });
  }
  return out;
}

// ---------- 3) 공단 스냅샷 + 실시간 오버레이 ----------

async function kotsaRows(lat, lon) {
  if (!KOTSA.length) return { rows: [], liveCount: 0 };
  const rt = await fetchRealtimeMap();   // 백엔드 장애·off면 null
  const rows = KOTSA.map((p) => {
    const live = rt?.get(p.id) || null;
    const cap = live?.capacity ?? p.capacity ?? null;
    const avail = live?.available ?? null;
    return {
      source: "kotsa",
      name: p.name, addr: p.addr, tel: "",
      kind: "", oper: "",
      free: false,
      capacity: cap,
      nowCnt: cap != null && avail != null ? Math.max(0, cap - avail) : null,
      available: avail,
      updatedAt: avail != null ? "실시간" : "",
      rate: p.rate ?? null, rateMin: p.rateMin ?? null,
      addRate: p.addRate ?? null, addMin: p.addMin ?? null,
      dailyMax: p.dailyMax ?? null,
      wd: p.wd || "", we: p.we || "",
      lat: p.lat, lon: p.lon, distance: Math.round(haversine(lat, lon, p.lat, p.lon)),
    };
  });
  return { rows, liveCount: rows.filter((r) => r.available != null).length };
}

// ---------- 소스 간 중복 제거 ----------
//
// 서울 소스와 표준데이터는 같은 주차장을 다른 좌표·표기로 싣는다.
// "주소가 서울이고 공영이면 표준데이터를 버린다" 같은 뭉텅이 규칙은 쓸 수 없다 —
// 서울 소스는 2,206행 중 좌표가 있는 게 118곳뿐이라, 그렇게 하면 표준데이터에만 좌표가 있는
// 서울 공영 663곳이 통째로 사라진다. (실측: 762곳 중 실제 충돌은 99곳)
//
// 그래서 이름(괄호·공백·'주차장' 접미어 제거)이 같고 200m 이내인 것만 중복으로 본다.
const normName = (s) => String(s).replace(/\([^)]*\)/g, "").replace(/\s+/g, "").replace(/(공영)?주차장$/, "");
const exactKey = (r) => `${normName(r.name)}@${r.lat.toFixed(3)},${r.lon.toFixed(3)}`;
const DUP_RADIUS_M = 200;

function dedupe(rows) {
  const out = [];
  const seenKeys = new Set();
  const byName = new Map();   // 정규화 이름 → 이미 채택된 행들
  for (const r of rows) {
    const k = exactKey(r);
    if (seenKeys.has(k)) continue;
    const nm = normName(r.name);
    // 이름이 통째로 지워지는 행("공영주차장" 등)은 근접 비교를 하면 서로를 잡아먹는다. 정확일치만 본다.
    if (nm) {
      const near = byName.get(nm);
      if (near?.some((s) => haversine(s.lat, s.lon, r.lat, r.lon) <= DUP_RADIUS_M)) continue;
      if (near) near.push(r); else byName.set(nm, [r]);
    }
    seenKeys.add(k);
    out.push(r);
  }
  return out;
}

// ---------- 핸들러 ----------

export default async function handler(req, res) {
  try {
    if (String(req.query.diag) === "1") {
      const snap = await nationwide();
      return res.status(200).json({
        ok: true,
        nationwide: { rows: snap.default.length, generatedAt: snap.generatedAt },
        kotsa: { snapshot: KOTSA.length, alive: kotsaAlive, note: kotsaNote, realtimeCache: kotsaCacheStatus(), backend: await kotsaProbe() },
        seoulKey: Boolean(process.env.SEOUL_API_KEY),
      });
    }

    const lat = Number(req.query.lat), lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: "현재 위치(lat, lon)가 필요합니다." });
    // limit은 하위호환(구 프론트). page/size가 오면 그쪽을 쓴다.
    const size = Math.min(Math.max(Number(req.query.size) || Number(req.query.limit) || 12, 1), 50);
    const page = Math.max(Number(req.query.page) || 1, 1);

    const KEY = process.env.SEOUL_API_KEY;
    // 서울 키가 없어도 전국 스냅샷으로는 답할 수 있다 — 더 이상 needKey로 막지 않는다.
    const [seoul, kotsa, snap] = await Promise.all([
      KEY ? seoulRows(KEY, lat, lon).catch(() => ({ rows: [], liveCount: 0, ok: false })) : Promise.resolve({ rows: [], liveCount: 0, ok: false }),
      kotsaRows(lat, lon).catch(() => ({ rows: [], liveCount: 0 })),
      nationwide(),
    ]);
    const NATIONWIDE = snap.default;

    // 실시간을 가진 소스를 먼저 넣어 중복 시 살아남게 한다.
    const merged = dedupe([...seoul.rows, ...kotsa.rows, ...nationwideRows(NATIONWIDE, lat, lon)]);

    let out = merged.sort((a, b) => a.distance - b.distance);
    if (String(req.query.live) === "1") out = out.filter((r) => r.available != null);
    if (String(req.query.free) === "1") out = out.filter((r) => r.free);

    // 필터 적용 후 건수 기준으로 페이지를 나눈다(전국 17,000여곳 전량이 대상).
    const matched = out.length;
    const totalPages = Math.max(Math.ceil(matched / size), 1);
    const cur = Math.min(page, totalPages);

    return res.status(200).json({
      ok: true,
      total: merged.length,
      matched, page: cur, size, totalPages,
      liveCount: seoul.liveCount + kotsa.liveCount,
      sources: { seoul: seoul.rows.length, kotsa: kotsa.rows.length, nationwide: NATIONWIDE.length },
      rows: out.slice((cur - 1) * size, cur * size),
    });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "주차장") });
  }
}
