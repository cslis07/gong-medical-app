// Vercel Serverless Function — 고속버스(KOBUS) · 시외버스(티머니) 조회
// 예매/결제는 하지 않는다. 시간표·잔여석(가능한 범위) 조회 + 공식 예매 링크 handoff.
// 참고: k-skill express-bus-booking / intercity-bus-booking (원문 흐름을 서버리스 1콜로 이식).
//   - 고속버스: 서버 HTML은 첫 행만 완전 렌더 → fnSatsChc 인자에서 출발시각·등급을 추출(잔여석/요금은 공식에서).
//   - 시외버스: readSasFeeInf 인자에 시각·운수사·등급·잔여/총좌석이 모두 담겨 완전 조회 가능.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";
const KOBUS = "https://www.kobus.co.kr";
const TMONEY = "https://intercitybus.tmoney.co.kr";

// KOBUS 등급 코드(indVBusClsCd) — 확실한 값만 매핑, 나머지는 공백
const KOBUS_GRADE = { "1": "일반", "2": "우등", "3": "심야우등", "4": "프리미엄", "5": "심야프리미엄" };

// 쿠키 자동 관리(undici fetch는 자동 저장을 안 하므로 수동 jar)
function makeJar() {
  const jar = new Map();
  return {
    absorb(resp) {
      const list = resp.headers.getSetCookie ? resp.headers.getSetCookie() : [];
      for (const c of list) { const kv = c.split(";")[0]; const i = kv.indexOf("="); if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1)); }
    },
    header() { return [...jar].map(([k, v]) => `${k}=${v}`).join("; "); },
  };
}

async function seed(jar, url, timeout = 14000) {
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(timeout) });
  jar.absorb(r); await r.arrayBuffer(); return r;
}
async function post(jar, url, body, referer, timeout = 20000) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Referer": referer, "X-Requested-With": "XMLHttpRequest", "Cookie": jar.header(),
    },
    body: typeof body === "string" ? body : new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(timeout),
  });
  jar.absorb(r);
  return r;
}
async function postText(jar, url, body, referer, timeout, charset = "utf-8") {
  const r = await post(jar, url, body, referer, timeout);
  const buf = await r.arrayBuffer();
  return { status: r.status, text: new TextDecoder(charset).decode(buf) };
}

function decodeEntities(s) { return String(s || "").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">"); }
function hhmm(v) { const s = String(v || ""); return /^\d{4,6}$/.test(s) ? `${s.slice(0, 2)}:${s.slice(2, 4)}` : s; }

// ===== 고속버스(KOBUS) =====
async function kobusTerminals() {
  const jar = makeJar();
  await seed(jar, `${KOBUS}/main.do`);
  const { text } = await postText(jar, `${KOBUS}/mrs/readRotLinInf.ajax`, "", `${KOBUS}/main.do`, 22000);
  let data; try { data = JSON.parse(text); } catch { return { terminals: [], routes: {} }; }
  const list = data.rotInfList || [];
  const tmap = new Map();       // code -> name
  const routes = {};            // deprCd -> [arvlCd...]
  for (const r of list) {
    if (r.deprCd && r.deprNm) tmap.set(r.deprCd, r.deprNm);
    if (r.arvlCd && r.arvlNm) tmap.set(r.arvlCd, r.arvlNm);
    if (r.deprCd && r.arvlCd) (routes[r.deprCd] ||= []).push(r.arvlCd);
  }
  const terminals = [...tmap].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return { terminals, routes };
}

async function kobusSchedule(dep, arr, date) {
  const jar = makeJar();
  await seed(jar, `${KOBUS}/main.do`);
  const { text } = await postText(jar, `${KOBUS}/mrs/alcnSrch.do`, {
    deprCd: dep, arvlCd: arr, pathDvs: "sngl", pathStep: "1", deprDtm: date,
    busClsCd: "0", rtrpChc: "1", timeLinkMin: "00", timeLinkMax: "23",
  }, `${KOBUS}/main.do`, 24000);

  // KOBUS 서버 HTML은 첫 행만 완전 렌더(나머지는 클라 JS) → 신뢰 가능한 fnSatsChc 인자만 사용
  const seen = new Set(); const rows = [];
  const re = /fnSatsChc\(([^)]*)\)/g; let m;
  while ((m = re.exec(text))) {
    const a = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
    if (a.length < 7 || !/^\d{6}$/.test(a[1] || "")) continue;
    const key = a[1] + a[5];
    if (seen.has(key)) continue; seen.add(key);
    rows.push({ time: hhmm(a[1]), grade: KOBUS_GRADE[a[5]] || "", depCd: a[3], arrCd: a[4] });
  }
  rows.sort((x, y) => x.time.localeCompare(y.time));
  return { rows, note: rows.length ? "잔여석·요금·운수사 등 상세와 예매는 공식 KOBUS 페이지에서 확인하세요." : "" };
}

// ===== 시외버스(티머니) =====
async function tmoneyTerminals() {
  const jar = makeJar();
  await seed(jar, `${TMONEY}/`);
  const { text } = await postText(jar, `${TMONEY}/otck/readTrmlList.do`, "", `${TMONEY}/`, 22000);
  let list; try { list = JSON.parse(text); } catch { return { terminals: [] }; }
  const terminals = (Array.isArray(list) ? list : [])
    .filter((t) => t.trml_Cd && t.trml_Nm)
    .map((t) => ({ code: t.trml_Cd, name: t.trml_Nm, area: t.cty_Bus_Area_Nm || "" }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return { terminals };
}

async function tmoneySchedule(dep, arr, depName, arrName, date) {
  const jar = makeJar();
  await seed(jar, `${TMONEY}/`);
  // bef_Aft_Dvs=D, req_Rec_Num=10 은 필수(사이트 JS가 붙임). 응답은 UTF-8.
  const { text } = await postText(jar, `${TMONEY}/otck/readAlcnList.do`, {
    depr_Trml_Cd: dep, arvl_Trml_Cd: arr, depr_Trml_Nm: depName || "", arvl_Trml_Nm: arrName || "",
    ig: "1", im: "0", ic: "0", iv: "0", depr_Dt: date, depr_Time: "000000",
    bef_Aft_Dvs: "D", req_Rec_Num: "10",
  }, `${TMONEY}/`, 24000);

  const rows = [];
  const re = /readSasFeeInf\(([^)]*)\)/g; let m;
  while ((m = re.exec(text))) {
    const a = [...m[1].matchAll(/'([^']*)'/g)].map((x) => decodeEntities(x[1]));
    if (a.length < 18) continue;
    // 0 rotId,1 sqno,2 date,3 ?,4 deprCd,5 arvlCd,6 deprNm,7 arvlNm,8 time,9 코드,10 코드,11 운수사,12 등급,13-15 cnt,16 잔여,17 총좌석
    rows.push({ time: hhmm(a[8]), company: a[11] || "", grade: a[12] || "", remain: Number(a[16] || 0), total: Number(a[17] || 0) });
  }
  return { rows, note: rows.length ? "잔여석은 조회 시점 참고값입니다. 예매는 공식 페이지에서 진행하세요." : "" };
}

export default async function handler(req, res) {
  try {
    const type = String(req.query.type || "").toLowerCase();   // express | intercity
    const op = String(req.query.op || "terminals").toLowerCase(); // terminals | schedule
    if (!["express", "intercity"].includes(type)) return res.status(400).json({ error: "type은 express|intercity 여야 합니다." });

    if (op === "terminals") {
      const out = type === "express" ? await kobusTerminals() : await tmoneyTerminals();
      return res.status(200).json({ ok: true, type, ...out });
    }
    if (op === "schedule") {
      const dep = String(req.query.dep || "").trim();
      const arr = String(req.query.arr || "").trim();
      const date = String(req.query.date || "").trim();
      if (!dep || !arr || !/^\d{8}$/.test(date)) return res.status(400).json({ error: "출발/도착 터미널 코드와 date(YYYYMMDD)가 필요합니다." });
      const out = type === "express"
        ? await kobusSchedule(dep, arr, date)
        : await tmoneySchedule(dep, arr, String(req.query.depName || ""), String(req.query.arrName || ""), date);
      return res.status(200).json({ ok: true, type, ...out });
    }
    return res.status(400).json({ error: `알 수 없는 op: ${op}` });
  } catch (err) {
    const msg = err?.name === "TimeoutError" ? "버스 사이트 응답 시간 초과" : String(err?.message || err);
    return res.status(500).json({ error: msg });
  }
}
