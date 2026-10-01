// 세션 토큰 발급/검증. 미들웨어(edge 런타임)에서도 돌아야 하므로
// Node 전용 API를 쓰지 않는다. 비밀번호 검증은 password.ts(Node 전용)에 있다.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "career_session";

const ALG = "HS256";
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30일
const RENEW_THRESHOLD_SECONDS = 60 * 60 * 24 * 20; // 남은 기간이 20일 미만이면 갱신

/**
 * edge 런타임은 process.env 를 정적 참조로만 인라인한다.
 * process.env[name] 같은 동적 접근은 미들웨어에서 undefined가 되므로 쓰지 않는다.
 */
function sessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET이 없거나 너무 짧습니다(32자 이상). `npm run gen:secret`으로 생성하세요.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function issueSessionToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: ALG })
    .setSubject("owner")
    .setIssuedAt(now)
    .setExpirationTime(now + TTL_SECONDS)
    .sign(sessionSecret());
}

export async function verifySessionToken(token: string): Promise<{ exp: number } | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: [ALG] });
    if (payload.sub !== "owner" || typeof payload.exp !== "number") return null;
    return { exp: payload.exp };
  } catch {
    return null;
  }
}

/** 만료가 가까워지면 토큰을 다시 발급해 로그인이 끊기지 않게 한다(슬라이딩 갱신). */
export function shouldRenew(exp: number): boolean {
  return exp - Math.floor(Date.now() / 1000) < RENEW_THRESHOLD_SECONDS;
}

export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    // 운영에서는 nginx가 HTTPS를 종단하므로 Secure를 붙인다.
    // nginx conf에 X-Forwarded-Proto가 없으면 이 쿠키가 전달되지 않아 로그인이 유지되지 않는다.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: TTL_SECONDS,
  };
}

export function clearedSessionCookie() {
  return { ...sessionCookie(""), maxAge: 0 };
}
