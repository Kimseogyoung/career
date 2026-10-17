import { NextResponse, type NextRequest } from "next/server";
import { verifyPassword } from "@/lib/password";
import { rateLimit, resetRateLimit, sweepRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-security";
import { issueSessionToken, sessionCookie } from "@/lib/session";

export const runtime = "nodejs";

// 비밀번호 최대 길이. 비정상적으로 긴 입력으로 argon2 검증 비용을 키우는 걸 막는다.
const MAX_PASSWORD_LENGTH = 256;

export async function POST(request: NextRequest) {
  sweepRateLimit();

  // X-Forwarded-For 첫 값은 위조 가능하므로 쓰지 않는다(ADR-014).
  const key = clientIp(request.headers);
  const limit = rateLimit(key);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "too_many_attempts", retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let password: unknown;
  try {
    ({ password } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    // 검증 없이 실패 처리(이미 레이트리밋에 1회로 집계됨).
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  let ok: boolean;
  try {
    ok = await verifyPassword(password);
  } catch (error) {
    // 서버 설정 누락(AUTH_PASSWORD_HASH 미설정)은 인증 실패와 구분해야 고칠 수 있다.
    console.error("[auth] 비밀번호 검증 실패:", error);
    return NextResponse.json({ error: "server_not_configured" }, { status: 500 });
  }

  if (!ok) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  resetRateLimit(key);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie(await issueSessionToken())); // 새 로그인 = 새 인증 시각
  return response;
}
