// Vercel Serverless Function — LH 분양·임대 공고 (한국토지주택공사, data.go.kr)
// B552555/lhLeaseNoticeInfo1. DATA_API_KEY 재사용. WAF 회피 위해 User-Agent 필요.
// 응답이 [ {resHeader}, {dsList:[...]} ] 형태의 배열인 LH 특유 포맷을 방어적으로 파싱.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";

export default async function handler(req, res) {
  try {
    if (!process.env.DATA_API_KEY) return res.status(200).json({ ok: false, needKey: true, message: "DATA_API_KEY가 설정되지 않았습니다." });
    const qs = new URLSearchParams({
      serviceKey: process.env.DATA_API_KEY,
      PG_SZ: String(Math.min(Number(req.query.size) || 30, 100)),
      PAGE: String(Number(req.query.page) || 1),
    });
    // 선택 필터: 지역코드(CNP_CD), 공고상태(PAN_SS), 공고명(PAN_NM), 유형(UPP_AIS_TP_CD)
    for (const [q, p] of [["region", "CNP_CD"], ["status", "PAN_SS"], ["name", "PAN_NM"], ["type", "UPP_AIS_TP_CD"]]) {
      const v = String(req.query[q] || "").trim();
      if (v) qs.set(p, v);
    }
    const r = await fetch(`https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1?${qs}`, {
      headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(14000),
    });
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { return res.status(200).json({ ok: false, message: `LH 응답 파싱 실패: ${t.slice(0, 120)}` }); }

    // 리스트 위치 방어적 탐색: 배열 최상위 / dsList / response.body 등
    let list = [];
    const dig = (o) => {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) { o.forEach(dig); return; }
      for (const [k, v] of Object.entries(o)) {
        if (Array.isArray(v) && v.length && v[0] && typeof v[0] === "object" && (v[0].PAN_NM || v[0].PAN_ID)) list.push(...v);
        else if (typeof v === "object") dig(v);
      }
    };
    dig(j);

    const rows = list.map((it) => ({
      id: it.PAN_ID || "",
      name: it.PAN_NM || "",
      type: it.AIS_TP_CD_NM || it.UPP_AIS_TP_NM || "",
      region: it.CNP_CD_NM || "",
      status: it.PAN_SS || "",
      postDate: it.PAN_NT_ST_DT || "",
      closeDate: it.CLSG_DT || "",
      url: it.DTL_URL || "",
    })).filter((x) => x.name);
    return res.status(200).json({ ok: true, count: rows.length, rows });
  } catch (err) {
    const msg = err?.name === "TimeoutError" ? "LH API 응답 시간 초과" : String(err?.message || err);
    return res.status(500).json({ error: msg });
  }
}
