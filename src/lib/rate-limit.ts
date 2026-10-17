import "server-only";

/**
 * 로그인 시도 제한. 외부에 노출되는 서비스이므로 무차별 대입 방어가 필요하다.
 * 인스턴스가 하나뿐이라(ADR-005) 프로세스 메모리로 충분하다(재시작 시 초기화).
 *
 * - IP별: 1분에 5회. IP 는 nginx 가 덮어쓰는 X-Real-IP 기준(request-security.clientIp).
 * - 전체: 1분에 30회. IP 를 바꿔 가며 시도하는 분산 대입의 상한(백스톱).
 *   공격 중엔 주인도 로그인이 막힐 수 있지만, 기존 세션은 그대로라 실사용 영향은 작다. (ADR-014)
 */
const WINDOW_MS = 60_000;
const MAX_PER_KEY = 5;
const MAX_GLOBAL = 30;

interface Bucket {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, Bucket>();
let global: Bucket = { count: 0, resetAt: 0 };

function hit(bucket: Bucket | undefined, now: number): Bucket {
  if (!bucket || now >= bucket.resetAt) return { count: 1, resetAt: now + WINDOW_MS };
  bucket.count += 1;
  return bucket;
}

export function rateLimit(key: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = hit(attempts.get(key), now);
  attempts.set(key, entry);
  global = hit(global, now);

  const blocked =
    entry.count > MAX_PER_KEY ? entry : global.count > MAX_GLOBAL ? global : null;
  if (blocked) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((blocked.resetAt - now) / 1000)) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** 로그인 성공 시 그 IP 의 기록만 지운다(전체 카운터는 창이 끝날 때까지 유지). */
export function resetRateLimit(key: string): void {
  attempts.delete(key);
}

/** 만료된 항목이 쌓이지 않게 정리한다. 요청 경로에서 호출된다. */
export function sweepRateLimit(): void {
  const now = Date.now();
  for (const [key, entry] of attempts) {
    if (now >= entry.resetAt) attempts.delete(key);
  }
}

/** 테스트 전용: 상태 초기화. */
export function __resetRateLimitForTest(): void {
  attempts.clear();
  global = { count: 0, resetAt: 0 };
}
