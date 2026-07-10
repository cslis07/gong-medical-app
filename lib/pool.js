// 동시성 제한 + 재시도 유틸 (비핸들러 모듈 — api/[service].js의 HANDLERS에 등록하지 않는다)
//
// data.go.kr 제공기관 서버는 병렬 버스트에 약하다.
// 실측: LH lhLeaseNoticeInfo1에 40페이지를 한 번에 던지면 13페이지가 실패한다(무응답).
// 실패를 조용히 빈 배열로 삼키면 "7,590건 중 2,700건"처럼 데이터가 말없이 사라진다.

/** 최대 limit개씩 동시에 실행. 실패한 작업은 결과에서 빠지고 failed 배열에 인덱스가 담긴다. */
export async function pool(items, limit, worker, { retries = 1, retryDelayMs = 500 } = {}) {
  const results = new Array(items.length);
  const failed = [];
  let cursor = 0;

  async function runOne(i) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try { results[i] = await worker(items[i], i); return; }
      catch (e) {
        if (attempt === retries) { failed.push({ index: i, error: String(e?.message || e).slice(0, 120) }); return; }
        await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)));
      }
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) await runOne(cursor++);
  });
  await Promise.all(runners);
  return { results, failed };
}
