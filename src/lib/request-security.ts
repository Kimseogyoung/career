// 요청 단위 보안 판정. 미들웨어(edge)·라우트·클라이언트가 함께 쓰므로 순수 함수로만 둔다.
// 판정 규칙은 request-security.test.ts 로 고정한다. (ADR-014)

/**
 * 로그인 레이트리밋에 쓸 클라이언트 IP.
 *
 * 앱은 127.0.0.1 에만 바인딩되고 앞단 nginx 만 접근한다. nginx 는
 * - `X-Real-IP` 를 실제 접속 주소($remote_addr)로 **덮어쓰고**,
 * - `X-Forwarded-For` 는 클라이언트가 보낸 값 **뒤에** 실제 주소를 덧붙인다($proxy_add_x_forwarded_for).
 * 그래서 X-Forwarded-For 의 첫 값은 공격자가 마음대로 정할 수 있다(레이트리밋 우회).
 * 신뢰할 수 있는 X-Real-IP 를 먼저 쓰고, 없으면 X-Forwarded-For 의 **마지막** 값(nginx 가 붙인 것)을 쓴다.
 */
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").map((s) => s.trim()).filter(Boolean).pop();
  return last || "unknown";
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * 다른 사이트에서 보낸 상태 변경 요청인가(CSRF 방어 2차선).
 * 1차는 세션 쿠키의 SameSite=Lax. 브라우저는 교차 출처 POST/PUT/PATCH/DELETE 에 항상 Origin 을 붙이므로,
 * Origin 이 있는데 우리 호스트가 아니면 거부한다. Origin 이 없는 요청(서버 간 스크립트 등)은 쿠키 인증에 맡긴다.
 */
export function isCrossSiteMutation(method: string, origin: string | null, host: string | null): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;
  if (!origin) return false;
  if (origin === "null") return true; // sandbox iframe·data: 등 불투명 출처
  try {
    return new URL(origin).host !== host;
  } catch {
    return true; // 해석 불가한 Origin 은 거부
  }
}

/**
 * 로그인 후 돌아갈 경로. 같은 출처의 경로만 허용하고 나머지는 "/".
 * `//evil.com`, `/\evil.com`(브라우저가 `//`로 해석), `https://…`, `javascript:` 등을 막는다(오픈 리다이렉트).
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  try {
    const base = "http://same.invalid";
    const u = new URL(next, base);
    if (u.origin !== base) return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}
