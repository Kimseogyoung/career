import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { __resetRateLimitForTest, rateLimit, resetRateLimit } from "./rate-limit";

beforeEach(() => __resetRateLimitForTest());

test("IP별: 1분에 5회까지, 6번째부터 차단", () => {
  for (let i = 0; i < 5; i++) assert.equal(rateLimit("1.1.1.1").allowed, true, `#${i + 1}`);
  const blocked = rateLimit("1.1.1.1");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
  assert.equal(rateLimit("2.2.2.2").allowed, true); // 다른 IP 는 별개
});

test("전체: IP 를 바꿔 가며 시도해도 1분에 30회가 상한(분산 대입 백스톱)", () => {
  for (let i = 0; i < 30; i++) assert.equal(rateLimit(`10.0.0.${i}`).allowed, true, `#${i + 1}`);
  assert.equal(rateLimit("10.0.1.99").allowed, false);
});

test("로그인 성공 시 그 IP 기록만 지운다", () => {
  for (let i = 0; i < 5; i++) rateLimit("3.3.3.3");
  resetRateLimit("3.3.3.3");
  assert.equal(rateLimit("3.3.3.3").allowed, true);
});
