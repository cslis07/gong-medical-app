// 로컬 검증용 서버 (Vercel 라우팅 모사: 정적파일 + /api/subway). 배포에는 사용 안 함.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import subwayHandler from "./api/subway.js";
import densityHandler from "./api/density.js";
import cinemaHandler from "./api/cinema.js";
import busHandler from "./api/bus.js";
import lottoHandler from "./api/lotto.js";
import gasHandler from "./api/gas.js";
import bikeHandler from "./api/bike.js";
import highwayHandler from "./api/highway.js";

const MIME = { ".html":"text/html", ".css":"text/css", ".js":"text/javascript", ".json":"application/json",
  ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".svg":"image/svg+xml", ".webp":"image/webp" };
const root = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3005;

// .env 간단 로더 (로컬 검증용 — DATA_API_KEY 주입)
try {
  const env = await readFile(join(root, ".env"), "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* .env 없으면 무시 */ }

createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const apiRes = { status: (c) => ({ json: (o) => { res.writeHead(c, {"content-type":"application/json"}); res.end(JSON.stringify(o)); } }) };
  if (u.pathname === "/api/subway") {
    return subwayHandler({ query: Object.fromEntries(u.searchParams) }, apiRes);
  }
  if (u.pathname === "/api/density") {
    return densityHandler({ query: Object.fromEntries(u.searchParams) }, apiRes);
  }
  if (u.pathname === "/api/cinema") {
    return cinemaHandler({ query: Object.fromEntries(u.searchParams) }, apiRes);
  }
  if (u.pathname === "/api/bus") {
    return busHandler({ query: Object.fromEntries(u.searchParams) }, apiRes);
  }
  if (u.pathname === "/api/lotto") {
    return lottoHandler({ query: Object.fromEntries(u.searchParams) }, apiRes);
  }
  if (u.pathname === "/api/gas") {
    return gasHandler({ query: Object.fromEntries(u.searchParams) }, apiRes);
  }
  if (u.pathname === "/api/bike") {
    return bikeHandler({ query: Object.fromEntries(u.searchParams) }, apiRes);
  }
  if (u.pathname === "/api/highway") {
    return highwayHandler({ query: Object.fromEntries(u.searchParams) }, apiRes);
  }
  let p = u.pathname === "/" ? "/index.html" : u.pathname;
  try {
    const buf = await readFile(join(root, p));
    res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
    res.end(buf);
  } catch { res.writeHead(404); res.end("404"); }
}).listen(PORT, () => console.log(`dev http://localhost:${PORT}`));
