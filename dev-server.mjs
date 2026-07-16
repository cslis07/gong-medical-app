// 로컬 검증용 서버 (Vercel 라우팅 모사: 정적파일 + /api/{service} catch-all). 배포에는 사용 안 함.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import apiRouter from "./api/[service].js";

const MIME = { ".html":"text/html", ".css":"text/css", ".js":"text/javascript", ".json":"application/json",
  ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".svg":"image/svg+xml", ".webp":"image/webp",
  ".webmanifest":"application/manifest+json", ".xml":"application/xml", ".txt":"text/plain" };
const root = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3005;

// .env 간단 로더 (로컬 검증용 — API 키 주입)
try {
  const env = await readFile(join(root, ".env"), "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* .env 없으면 무시 */ }

createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  // Vercel의 res 모사 — setHeader는 라우터가 Cache-Control을 붙이는 데 쓴다.
  const headers = { "content-type": "application/json" };
  const apiRes = {
    setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
    status: (c) => ({ json: (o) => { res.writeHead(c, headers); res.end(JSON.stringify(o)); } }),
  };
  const m = u.pathname.match(/^\/api\/([a-z]+)$/);
  if (m) {
    return apiRouter({ query: { service: m[1], ...Object.fromEntries(u.searchParams) } }, apiRes);
  }
  let p = u.pathname === "/" ? "/index.html" : u.pathname;
  try {
    const buf = await readFile(join(root, p));
    res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
    res.end(buf);
  } catch { res.writeHead(404); res.end("404"); }
}).listen(PORT, () => console.log(`dev http://localhost:${PORT}`));
