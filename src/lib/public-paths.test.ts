import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublicPath, isShowcasePath } from "./public-paths";

// 공개 범위는 보안 경계다. 여기 목록이 바뀌면 의도한 변경인지 ADR-013 과 함께 확인한다.

test("공개: 로그인·헬스체크·Showcase 와 그 하위", () => {
  for (const p of [
    "/login",
    "/api/auth/login",
    "/api/health",
    "/showcase",
    "/showcase/achievements",
    "/showcase/media/01AAAAAAAAAAAAAAAAAAAAAAAA/01BBBBBBBBBBBBBBBBBBBBBBBB", // 공개 사진
  ]) {
    assert.equal(isPublicPath(p), true, p);
  }
});

test("비공개: 기록·요약·설정·커리어·모든 데이터 API", () => {
  for (const p of [
    "/",
    "/journal",
    "/journal/day/2026-10-01",
    "/career",
    "/career/me",
    "/career/projects",
    "/settings",
    "/search",
    "/api/achievements",
    "/api/projects",
    "/api/profile",
    "/api/journal/2026-10-01",
    "/api/settings",
    "/api/export",
    "/api/public/achievements", // 공개 JSON API 는 두지 않는다(ADR-013)
  ]) {
    assert.equal(isPublicPath(p), false, p);
  }
});

test("Showcase 유사 경로는 열리지 않는다", () => {
  for (const p of ["/showcaseX", "/showcase-admin", "/showcases", "/api/showcase", "/x/showcase"]) {
    assert.equal(isShowcasePath(p), false, p);
    assert.equal(isPublicPath(p), false, p);
  }
});
