import { test } from "node:test";
import assert from "node:assert/strict";
import { isEmail, linkLabel, safeUrl } from "./contact";

test("링크: http(s) 만 허용 — 스크립트가 실행될 수 있는 스킴·상대 경로는 거부", () => {
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl("JavaScript:alert(1)"), null);
  assert.equal(safeUrl("data:text/html,<script>1</script>"), null);
  assert.equal(safeUrl("ftp://example.com/a"), null);
  assert.equal(safeUrl("/showcase"), null);
  assert.equal(safeUrl("localhost"), null);
  assert.equal(safeUrl(""), null);
  assert.equal(safeUrl(undefined), null);
  assert.equal(safeUrl(`https://a.com/${"x".repeat(400)}`), null);
});

test("링크: https·http 는 정규화, 스킴이 없으면 https 로 본다", () => {
  assert.equal(safeUrl("https://github.com/me"), "https://github.com/me");
  assert.equal(safeUrl("  http://blog.example.com  "), "http://blog.example.com/");
  assert.equal(safeUrl("github.com/me"), "https://github.com/me");
});

test("이메일 형식", () => {
  assert.ok(isEmail("me@example.com"));
  assert.ok(isEmail(" me@example.com "));
  assert.ok(!isEmail("me@example"));
  assert.ok(!isEmail("me example@x.com"));
  assert.ok(!isEmail("<a>@x.com"));
  assert.ok(!isEmail(""));
});

test("링크 이름: 비면 호스트명(www 제거), 길면 자른다", () => {
  assert.equal(linkLabel("", "https://www.github.com/me"), "github.com");
  assert.equal(linkLabel(" GitHub ", "https://github.com/me"), "GitHub");
  assert.equal(linkLabel("가".repeat(50), "https://a.com").length, 30);
});
