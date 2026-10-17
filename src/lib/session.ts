// 세션 토큰 발급/검증. 미들웨어(edge 런타임)에서도 돌아야 하므로
// Node 전용 API를 쓰지 않는다. 비밀번호 검증은 password.ts(Node 전용)에 있다.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "career_session";

const ALG = "HS256";
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30일
const RENEW_THRESHOLD_SECONDS = 60 * 60 * 24 * 20; // 남은 기간이 20일 미만이면 갱신
// 슬라이딩 갱신과 무관한 최대 수명. 로그인한 지 이만큼 지나면 다시 로그인해야 한다(탈취 쿠키의 수명 상한).
export const ABSOLUTE_MAX_SECONDS = 60 * 60 * 24 * 90; // 90일

export interface Session {
  exp: number;
  authTime: number; // 실제로 비밀번호로 로그인한 시각(갱신해도 유지)
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * 현재 비밀번호 해시의 짧은 지문. 토큰에 넣어 두고 검증 때 비교한다 —
 * 비밀번호를 바꾸면(AUTH_PASSWORD_HASH 교체) 그 전에 발급된 세션이 모두 무효가 된다("전체 로그아웃").
 * Web Crypto 만 써서 edge(미들웨어)에서도 돈다.
 */
async function passwordFingerprint(): Promise<string> {
  const source = process.env.AUTH_PASSWORD_HASH ?? "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

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

/**
 * 세션 토큰 발급. authTime 을 넘기면(갱신) 원래 로그인 시각을 유지하고, 없으면(새 로그인) 지금.
 */
export async function issueSessionToken(authTime?: number): Promise<string> {
  const now = nowSeconds();
  return new SignJWT({ pv: await passwordFingerprint(), at: authTime ?? now })
    .setProtectedHeader({ alg: ALG })
    .setSubject("owner")
    .setIssuedAt(now)
    .setExpirationTime(now + TTL_SECONDS)
    .sign(sessionSecret());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: [ALG] });
    if (payload.sub !== "owner" || typeof payload.exp !== "number") return null;
    // 비밀번호가 바뀌었으면 이전 세션은 무효.
    if (payload.pv !== (await passwordFingerprint())) return null;
    // 최대 수명 초과(또는 인증 시각이 없는 구버전 토큰)면 무효.
    const at = payload.at;
    if (typeof at !== "number" || nowSeconds() - at > ABSOLUTE_MAX_SECONDS) return null;
    return { exp: payload.exp, authTime: at };
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
