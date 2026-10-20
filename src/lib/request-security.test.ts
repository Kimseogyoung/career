import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp, isCrossSiteMutation, safeNextPath } from "./request-security";

// ── 클라이언트 IP (로그인 레이트리밋 키) ──────────────────────────

test("IP: nginx 가 덮어쓴 X-Real-IP 를 쓴다", () => {
  const h = new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4, 203.0.113.7" });
  assert.equal(clientIp(h), "203.0.113.7");
});

test("IP: X-Forwarded-For 첫 값(위조 가능)으로 키를 바꿀 수 없다", () => {
  // 공격자가 요청마다 XFF 첫 값을 바꿔도 nginx 가 붙인 실제 주소는 같다.
  const keys = ["a", "b", "c"].map((spoof) =>
    clientIp(new Headers({ "x-real-ip": "198.51.100.9", "x-forwarded-for": `${spoof}, 198.51.100.9` })),
  );
  assert.deepEqual(new Set(keys), new Set(["198.51.100.9"]));
});

test("IP: X-Real-IP 가 없으면 X-Forwarded-For 의 마지막 값", () => {
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "spoof, 10.0.0.5" })), "10.0.0.5");
  assert.equal(clientIp(new Headers()), "unknown");
});

// ── CSRF (교차 출처 변경 요청) ────────────────────────────────────

const HOST = "career.example.com";

test("CSRF: 다른 사이트의 POST/PUT/PATCH/DELETE 는 차단", () => {
  for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(isCrossSiteMutation(m, "https://evil.example", HOST), true, m);
  }
});

test("CSRF: 같은 출처, GET, Origin 없는 요청은 통과", () => {
  assert.equal(isCrossSiteMutation("POST", `https://${HOST}`, HOST), false);
  assert.equal(isCrossSiteMutation("GET", "https://evil.example", HOST), false);
  assert.equal(isCrossSiteMutation("POST", null, HOST), false); // 서버 스크립트(Origin 없음)
});

test("CSRF: 불투명·해석 불가 Origin 은 차단", () => {
  assert.equal(isCrossSiteMutation("POST", "null", HOST), true);
  assert.equal(isCrossSiteMutation("POST", "::::", HOST), true);
  // 호스트를 접두사로 흉내 낸 도메인
  assert.equal(isCrossSiteMutation("POST", `https://${HOST}.evil.example`, HOST), true);
});

// ── 로그인 후 리다이렉트 ──────────────────────────────────────────

test("리다이렉트: 같은 출처 경로는 유지", () => {
  assert.equal(safeNextPath("/career/me"), "/career/me");
  assert.equal(safeNextPath("/search?q=redis#top"), "/search?q=redis#top");
});

test("리다이렉트: 외부로 나가는 값은 전부 '/'", () => {
  for (const bad of [
    null,
    "",
    "career",
    "//evil.example",
    "/\\evil.example", // 브라우저가 // 로 해석
    "/\\/evil.example",
    "https://evil.example",
    "javascript:alert(1)",
    "\\\\evil.example",
  ]) {
    assert.equal(safeNextPath(bad), "/", String(bad));
  }
});
