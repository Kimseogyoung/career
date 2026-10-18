import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCareer, suggestCareer } from "./career-link";
import type { CareerEntry } from "@/lib/store/types";

const career: CareerEntry[] = [
  { id: "now", org: "파이드픽셀즈", start: "2024-01", current: true },
  { id: "old", org: "엔픽셀", start: "2022-07", end: "2023-12" },
];
const NOW = "2026-10";

test("회사 추정: 기간이 가장 많이 겹치는 경력", () => {
  // 2023-06 ~ 2024-03 → 엔픽셀 7개월, 파이드픽셀즈 3개월
  const p = { start: { date: "2023-06" }, end: { date: "2024-03" } };
  assert.equal(suggestCareer(p, career, NOW)?.id, "old");
});

test("회사 추정: 진행 중이면 이번 달까지, 종료가 없으면 시작 월 한 달로 본다", () => {
  assert.equal(suggestCareer({ start: { date: "2025-03" }, end: { ongoing: true } }, career, NOW)?.id, "now");
  assert.equal(suggestCareer({ start: { date: "2023-02" } }, career, NOW)?.id, "old");
});

test("회사 추정: 시작 날짜가 없거나 겹치는 경력이 없으면 없음", () => {
  assert.equal(suggestCareer({}, career, NOW), undefined);
  assert.equal(suggestCareer({ start: { date: "2019-01" }, end: { date: "2020-01" } }, career, NOW), undefined);
  // 날짜 없는(옮기지 못한) 경력은 후보가 아니다
  assert.equal(suggestCareer({ start: { date: "2023-01" } }, [{ id: "x", org: "?", period: "언젠가" }], NOW), undefined);
});

test("회사 연결: 직접 고른 게 우선, 지워진 경력을 가리키면 자동 추정으로", () => {
  const p = { start: { date: "2025-03" }, end: { ongoing: true } };
  assert.deepEqual(resolveCareer({ ...p, careerId: "old" }, career, NOW), { entry: career[1], auto: false });
  assert.deepEqual(resolveCareer({ ...p, careerId: "gone" }, career, NOW), { entry: career[0], auto: true });
  assert.equal(resolveCareer({ careerId: "gone" }, career, NOW), undefined);
});
