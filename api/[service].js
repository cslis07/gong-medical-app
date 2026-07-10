// Vercel Serverless Function — 통합 API 라우터 (catch-all)
// Hobby 플랜 함수 12개 제한 대응: /api/{service} 를 단일 함수로 받아 lib/ 핸들러에 위임.
// 기존 프론트 URL(/api/subway, /api/gas 등)은 그대로 동작한다.

import subway from "../lib/subway.js";
import density from "../lib/density.js";
import lotto from "../lib/lotto.js";
import gas from "../lib/gas.js";
import bike from "../lib/bike.js";
import highway from "../lib/highway.js";
import realestate from "../lib/realestate.js";
import air from "../lib/air.js";
import citybus from "../lib/citybus.js";
import lh from "../lib/lh.js";
import geocode from "../lib/geocode.js";
import myhome from "../lib/myhome.js";
import parking from "../lib/parking.js";

const HANDLERS = { subway, density, lotto, gas, bike, highway, realestate, air, citybus, lh, geocode, myhome, parking };

export default async function handler(req, res) {
  const svc = String(req.query.service || "");
  const h = HANDLERS[svc];
  if (!h) return res.status(404).json({ error: `알 수 없는 서비스: ${svc}` });
  // service 파라미터는 하위 핸들러 쿼리에서 제거
  delete req.query.service;
  return h(req, res);
}
