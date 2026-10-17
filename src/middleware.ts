import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  issueSessionToken,
  sessionCookie,
  shouldRenew,
  verifySessionToken,
} from "@/lib/session";
import { isPublicPath } from "@/lib/public-paths";
import { isCrossSiteMutation } from "@/lib/request-security";

// 인증 없이 접근 가능한 경로는 isPublicPath 로만 판정한다(로그인·헬스체크·공개 Showcase).
// 그 외 모든 경로는 세션을 요구한다. 판정 범위는 public-paths.test.ts 로 고정. (ADR-013)

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CSRF 2차 방어: 다른 사이트에서 보낸 상태 변경 요청은 세션 확인 전에 끊는다(ADR-014).
  if (
    isCrossSiteMutation(request.method, request.headers.get("origin"), request.headers.get("host"))
  ) {
    return NextResponse.json({ error: "cross_site_request" }, { status: 403 });
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (isPublicPath(pathname)) {
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
    // 갱신해도 원래 로그인 시각은 유지 → 최대 수명(90일)이 슬라이딩으로 늘어나지 않는다.
    response.cookies.set(sessionCookie(await issueSessionToken(session.authTime)));
  }
  return response;
}

export const config = {
  matcher: [
    // 정적 자산과 PWA 관련 파일은 미들웨어를 타지 않는다.
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js).*)",
  ],
};
