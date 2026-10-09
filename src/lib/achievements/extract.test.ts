import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCandidates } from "./extract";

test("깨끗한 JSON 배열 파싱 + 필드 정규화", () => {
  const r = parseCandidates(
    '[{"title":"DB 최적화","problem":"RPS 부족","approach":"캐시 계층화","result":"부하 감소","tech":["Redis","MySQL"],"theme":"성능·DB","sourceDates":["2026-10-01","bad"]}]',
  );
  assert.equal(r.length, 1);
  assert.equal(r[0]!.title, "DB 최적화");
  assert.deepEqual(r[0]!.tech, ["Redis", "MySQL"]);
  assert.deepEqual(r[0]!.sourceDates, ["2026-10-01"]); // 형식 안 맞는 날짜 제거
});

test("코드펜스로 감싼 출력도 파싱", () => {
  const r = parseCandidates('```json\n[{"title":"무중단 배포"}]\n```');
  assert.equal(r.length, 1);
  assert.equal(r[0]!.title, "무중단 배포");
  assert.deepEqual(r[0]!.tech, []);
});

test("앞뒤 잡텍스트가 있어도 배열만 뽑는다", () => {
  const r = parseCandidates('다음과 같습니다:\n[{"title":"A"},{"title":"B"}]\n이상.');
  assert.deepEqual(
    r.map((x) => x.title),
    ["A", "B"],
  );
});

test("title 없는 항목은 버리고, 상세 없는 건 요약으로", () => {
  const r = parseCandidates('[{"title":""},{"approach":"x"},{"title":"ok"}]');
  assert.equal(r.length, 1);
  assert.equal(r[0]!.title, "ok");
  assert.equal(r[0]!.problem, undefined);
});

test("JSON 아니면 빈 배열", () => {
  assert.deepEqual(parseCandidates("추출할 성과가 없습니다."), []);
  assert.deepEqual(parseCandidates("[not json]"), []);
});
