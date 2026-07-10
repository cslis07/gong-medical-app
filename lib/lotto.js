// Vercel Serverless Function — 로또 6/45 당첨결과
// 참고: k-skill lotto-results. dhlottery.co.kr는 해외/데이터센터 IP를 차단하므로(Vercel 불가),
// 공개 CDN 미러(smok95.github.io/lotto, GitHub Pages·CORS)를 프록시한다. 키 불필요.

import { errorMessage } from "./respond.js";

const MIRROR = "https://smok95.github.io/lotto/results";

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  try {
    const round = String(req.query.round || "latest").trim();
    const key = round === "latest" || /^\d+$/.test(round) ? round : "latest";
    const d = await getJson(`${MIRROR}/${key}.json`);
    // 미러 포맷: {draw_no, numbers[6], bonus_no, date, divisions[5]{prize,winners}, total_sales_amount}
    const out = {
      round: d.draw_no,
      date: (d.date || "").slice(0, 10),
      numbers: d.numbers || [],
      bonus: d.bonus_no,
      divisions: (d.divisions || []).map((x, i) => ({ rank: i + 1, prize: x.prize, winners: x.winners })),
      totalSales: d.total_sales_amount,
    };
    return res.status(200).json({ ok: true, ...out });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "로또") });
  }
}
