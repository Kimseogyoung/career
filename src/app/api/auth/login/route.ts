import { NextResponse, type NextRequest } from "next/server";
import { verifyPassword } from "@/lib/password";
import { rateLimit, resetRateLimit, sweepRateLimit } from "@/lib/rate-limit";
import { issueSessionToken, sessionCookie } from "@/lib/session";

export const runtime = "nodejs";

function clientKey(request: NextRequest): string {
  // nginx가 앞단에 있으므로 원격 주소는 항상 프록시의 것이다. 전달 헤더를 본다.
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: NextRequest) {
  sweepRateLimit();

  const key = clientKey(request);
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
  response.cookies.set(sessionCookie(await issueSessionToken()));
  return response;
}
