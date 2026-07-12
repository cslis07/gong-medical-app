// Vercel Serverless Function — 근처 최저가 주유소 (Opinet 오픈 API)
// 참고: k-skill cheap-gas-nearby. 브라우저 geolocation(WGS84) → proj4로 KATEC 변환 →
//   Opinet aroundAll.do(반경 내) + detailById.do(주소·편의시설). 키는 OPINET_API_KEY(certkey).
import proj4 from "proj4";
import { errorMessage } from "./respond.js";

const OPINET = "https://www.opinet.co.kr/api";
// Opinet 공식 KATEC 정의(7-파라미터 Bessel→WGS84 포함)
const KATEC = "+proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000 +y_0=600000 +ellps=bessel +units=m +no_defs +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43";

// 상표코드 → 이름
const BRAND = {
  SKE: "SK에너지", GSC: "GS칼텍스", HDO: "현대오일뱅크", SOL: "S-OIL",
  RTE: "자영알뜰", RTX: "고속도로알뜰", NHO: "농협알뜰", ETC: "자가상표",
  E1G: "E1", SKG: "SK가스", RTO: "알뜰(자영)",
};
const PRODS = new Set(["B027", "D047", "B034", "C004", "K015"]);

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(13000) });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { _raw: t.slice(0, 200) }; }
}
const yn = (v) => String(v || "").toUpperCase() === "Y";

export default async function handler(req, res) {
  try {
    const KEY = process.env.OPINET_API_KEY;
    if (!KEY) return res.status(200).json({ ok: false, needKey: true, message: "OPINET_API_KEY(오피넷 인증키)가 설정되지 않았습니다." });

    // 전국 평균유가 (avgAllPrice)
    if (String(req.query.op) === "avg") {
      const j = await getJson(`${OPINET}/avgAllPrice.do?out=json&code=${encodeURIComponent(KEY)}&certkey=${encodeURIComponent(KEY)}`);
      let oil = j?.RESULT?.OIL || [];
      if (!Array.isArray(oil)) oil = oil ? [oil] : [];
      const rows = oil.map((o) => ({ prodcd: o.PRODCD, name: o.PRODNM, price: Number(o.PRICE) || null, diff: Number(o.DIFF) || 0, date: o.TRADE_DT }));
      return res.status(200).json({ ok: true, avg: rows });
    }

    const lat = Number(req.query.lat), lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: "현재 위치(lat, lon)가 필요합니다." });
    const prodcd = PRODS.has(String(req.query.prodcd)) ? String(req.query.prodcd) : "B027";
    const radius = Math.min(Math.max(Number(req.query.radius) || 3000, 500), 5000);
    const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 10);

    // WGS84 → KATEC
    const [x, y] = proj4("WGS84", KATEC, [lon, lat]);

    const url = `${OPINET}/aroundAll.do?out=json&code=${encodeURIComponent(KEY)}&certkey=${encodeURIComponent(KEY)}&x=${x.toFixed(1)}&y=${y.toFixed(1)}&radius=${radius}&prodcd=${prodcd}&sort=1`;
    const j = await getJson(url);
    let oil = j?.RESULT?.OIL || [];
    if (!Array.isArray(oil)) oil = oil ? [oil] : [];
    if (!oil.length) return res.status(200).json({ ok: true, prodcd, radius, rows: [], message: j?.RESULT?.CODE || "반경 내 주유소가 없습니다." });

    // 가격순 상위 N만 detailById로 주소·편의시설 보강 (병렬)
    const top = oil.slice(0, limit);
    const details = await Promise.all(top.map(async (o) => {
      try {
        const d = await getJson(`${OPINET}/detailById.do?out=json&code=${encodeURIComponent(KEY)}&certkey=${encodeURIComponent(KEY)}&id=${encodeURIComponent(o.UNI_ID)}`);
        return d?.RESULT?.OIL?.[0] || d?.RESULT?.OIL || null;
      } catch { return null; }
    }));

    const rows = top.map((o, i) => {
      const dt = details[i] || {};
      return {
        id: o.UNI_ID,
        name: o.OS_NM,
        brand: BRAND[o.POLL_DIV_CD] || o.POLL_DIV_CD || "",
        price: Number(o.PRICE) || null,
        distance: Math.round(Number(o.DISTANCE) || 0),
        address: dt.NEW_ADR || dt.VAN_ADR || "",
        tel: dt.TEL || "",
        // Opinet aroundAll·detailById 어디에도 셀프 여부 필드가 없어 제거(과거 selfYn은 항상 false였다).
        carWash: yn(dt.CAR_WASH_YN),
        maint: yn(dt.MAINT_YN),
        cvs: yn(dt.CVS_YN),
        kpetro: yn(dt.KPETRO_YN),
      };
    });
    return res.status(200).json({ ok: true, prodcd, radius, rows });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "주유소") });
  }
}
