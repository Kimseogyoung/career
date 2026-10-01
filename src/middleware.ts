import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  issueSessionToken,
  sessionCookie,
  shouldRenew,
  verifySessionToken,
} from "@/lib/session";

/** 인증 없이 접근 가능한 경로. 그 외 모든 경로는 세션을 요구한다. */
const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/api/health"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (PUBLIC_PATHS.has(pathname)) {
    // 이미 로그인한 상태로 로그인 화면에 오면 홈으로 보낸다.
    if (pathname === "/login" && session) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!session) {
    // API는 리다이렉트하면 클라이언트가 HTML을 JSON으로 파싱하게 된다. 401로 끊는다.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();
  if (shouldRenew(session.exp)) {
    response.cookies.set(sessionCookie(await issueSessionToken()));
  }
  return response;
}

export const config = {
  matcher: [
    // 정적 자산과 PWA 관련 파일은 미들웨어를 타지 않는다.
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js).*)",
  ],
};
