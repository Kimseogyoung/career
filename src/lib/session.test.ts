import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { ABSOLUTE_MAX_SECONDS, issueSessionToken, verifySessionToken } from "./session";

const SECRET = "x".repeat(40);

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.AUTH_PASSWORD_HASH = "hash-A";
});

const now = () => Math.floor(Date.now() / 1000);

test("발급한 토큰은 검증되고 인증 시각을 돌려준다", async () => {
  const s = await verifySessionToken(await issueSessionToken());
  assert.ok(s);
  assert.ok(Math.abs(s.authTime - now()) <= 2);
});

test("갱신 발급은 원래 인증 시각을 유지한다", async () => {
  const at = now() - 60 * 60 * 24 * 40;
  const s = await verifySessionToken(await issueSessionToken(at));
  assert.equal(s?.authTime, at);
});

test("비밀번호를 바꾸면 이전 세션은 모두 무효", async () => {
  const token = await issueSessionToken();
  process.env.AUTH_PASSWORD_HASH = "hash-B";
  assert.equal(await verifySessionToken(token), null);
});

test("로그인한 지 90일이 넘으면 갱신된 토큰이어도 무효", async () => {
  const fresh = await issueSessionToken(now() - (ABSOLUTE_MAX_SECONDS - 60));
  assert.ok(await verifySessionToken(fresh));
  const stale = await issueSessionToken(now() - (ABSOLUTE_MAX_SECONDS + 60));
  assert.equal(await verifySessionToken(stale), null);
});

test("구버전 토큰(지문·인증 시각 없음)은 무효", async () => {
  const legacy = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("owner")
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(new TextEncoder().encode(SECRET));
  assert.equal(await verifySessionToken(legacy), null);
});

test("다른 비밀키로 서명된 토큰·변조 토큰은 무효", async () => {
  const forged = await new SignJWT({ pv: "x", at: now() })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("owner")
    .setExpirationTime("30d")
    .sign(new TextEncoder().encode("y".repeat(40)));
  assert.equal(await verifySessionToken(forged), null);
  const token = await issueSessionToken();
  assert.equal(await verifySessionToken(token.slice(0, -2) + "xx"), null);
});
