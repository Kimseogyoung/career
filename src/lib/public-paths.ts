// 인증 없이 접근 가능한 경로 판정. 미들웨어와 앱 헤더가 공유한다. (ADR-013)
// 순수 함수로 두어 테스트로 공개 범위를 고정한다 — 여기가 넓어지면 비공개 데이터가 새어 나간다.

const PUBLIC_EXACT = new Set(["/login", "/api/auth/login", "/api/health"]);

/** 공개 Showcase 경로: `/showcase` 와 그 하위만. `/showcaseX` 같은 유사 경로는 아니다. */
export function isShowcasePath(pathname: string): boolean {
  return pathname === "/showcase" || pathname.startsWith("/showcase/");
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_EXACT.has(pathname) || isShowcasePath(pathname);
}
