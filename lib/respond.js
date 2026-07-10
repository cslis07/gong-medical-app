// 응답 공통 유틸 (비핸들러 모듈 — api/[service].js의 HANDLERS에 등록하지 않는다)

/**
 * 클라이언트에 돌려줄 오류 메시지를 만든다.
 *
 * 기존에는 `String(err?.message || err)`를 그대로 내보냈다. 이러면
 *   · 상위 API URL이 섞인 예외 메시지(URL 안에 serviceKey가 들어 있다)
 *   · 상위 서버의 오류 본문·내부 경로·스택
 * 이 공개 응답에 실려 나갈 수 있다. 원문은 서버 로그로만 남기고,
 * 사용자에게는 무엇을 해야 하는지만 알려준다.
 *
 * @param {unknown} err  잡은 예외
 * @param {string} label 사용자에게 보일 기능 이름 (예: "주차장")
 */
export function errorMessage(err, label) {
  const raw = String(err?.message || err);
  // 서버 로그에는 원문을 남긴다(Vercel 함수 로그에서만 보인다).
  console.error(`[${label}]`, raw);

  if (err?.name === "TimeoutError" || err?.name === "AbortError") return `${label} API 응답 시간 초과`;
  if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|EHOSTUNREACH|ECONNRESET/i.test(raw)) {
    return `${label} 제공기관 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.`;
  }
  return `${label} 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.`;
}

/**
 * 키가 URL에 실려 나가는 상위 API 특성상, 밖으로 내보내는 문자열에서
 * 인증키로 보이는 값을 지운다. (상위 응답 본문을 인용해야 할 때만 사용)
 */
export function redact(text) {
  return String(text ?? "")
    .replace(/(serviceKey|certkey|code|key)=[^&\s"']+/gi, "$1=<redacted>")
    .replace(/[0-9a-f]{32,}/gi, "<redacted>");
}
