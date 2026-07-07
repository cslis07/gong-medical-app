// Vercel Serverless Function — 영화관 검색 (CGV·메가박스·롯데시네마)
// 공개 API mcp.aka.page (원본 hmmhmmhm/daiso-mcp)를 서버에서 프록시해 CORS·키 문제를 없앤다.
// 참고: k-skill korean-cinema-search (원문은 npx daiso CLI 사용, 여기서는 동일 HTTP 표면을 직접 호출).

const UPSTREAM = "https://mcp.aka.page";
const CHAINS = { cgv: "cgv", megabox: "megabox", lottecinema: "lottecinema" };
// 체인별 지원 op — CGV는 timetable, 메가박스·롯데는 seats
const OPS = {
  cgv: new Set(["theaters", "movies", "timetable"]),
  megabox: new Set(["theaters", "movies", "seats"]),
  lottecinema: new Set(["theaters", "movies", "seats"]),
};

// KST 기준 오늘 YYYYMMDD
function kstToday() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(25000), headers: { "accept": "application/json" } });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = { success: false, _raw: t.slice(0, 300) }; }
  return { status: r.status, j };
}

export default async function handler(req, res) {
  try {
    const chain = CHAINS[String(req.query.chain || "").toLowerCase()];
    const op = String(req.query.op || "theaters").toLowerCase();
    if (!chain) return res.status(400).json({ error: "chain은 cgv|megabox|lottecinema 중 하나여야 합니다." });
    if (!OPS[chain].has(op)) return res.status(400).json({ error: `${chain}는 op=${[...OPS[chain]].join("|")}만 지원합니다.` });

    const qs = new URLSearchParams();
    const keyword = String(req.query.keyword || "").trim();
    const theaterId = String(req.query.theaterId || "").trim();
    const movieId = String(req.query.movieId || "").trim();
    if (theaterId) qs.set("theaterId", theaterId);
    else if (keyword) qs.set("keyword", keyword);
    if (op !== "theaters") {
      qs.set("playDate", String(req.query.playDate || "").trim() || kstToday());
      if (movieId) qs.set("movieId", movieId);
    }
    if (op === "theaters") qs.set("limit", String(req.query.limit || "8"));
    if (op === "seats") qs.set("limit", String(req.query.limit || "12"));

    const url = `${UPSTREAM}/api/${chain}/${op}?${qs.toString()}`;
    const { status, j } = await getJson(url);
    if (!j || j.success === false) {
      return res.status(200).json({ ok: false, chain, op, message: (j && j.error) || `상영관 응답 오류 (HTTP ${status})`, data: null });
    }
    return res.status(200).json({ ok: true, chain, op, data: j.data ?? j });
  } catch (err) {
    const msg = err?.name === "TimeoutError" ? "영화관 API 응답 시간 초과" : String(err?.message || err);
    return res.status(500).json({ error: msg });
  }
}
