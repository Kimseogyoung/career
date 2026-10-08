import { test } from "node:test";
import assert from "node:assert/strict";
import { runSearch, tokenize, type DayEntry } from "./search";

function e(id: string, date: string, content: string, extra: Partial<DayEntry> = {}): DayEntry {
  return {
    id,
    date,
    start: extra.start ?? "09:00",
    end: extra.end ?? "10:00",
    category: extra.category ?? "work",
    tags: extra.tags ?? [],
    content,
    createdAt: extra.createdAt ?? `${date}T09:00:00+09:00`,
    updatedAt: extra.updatedAt ?? `${date}T09:00:00+09:00`,
  };
}

test("tokenize: 한국어는 통단어+2gram, 영어 단어도 포함", () => {
  const t = tokenize("결제API");
  assert.ok(t.includes("결제")); // 2gram
  assert.ok(t.includes("결제api")); // 통단어(소문자)
});

const SAMPLE: DayEntry[] = [
  e("1", "2026-01-10", "스프린트 결제 API 구현", { tags: ["nextjs"], category: "work" }),
  e("2", "2026-03-05", "결제 버그 수정", { category: "work" }),
  e("3", "2026-05-20", "알고리즘 공부", { tags: ["cs"], category: "study" }),
  e("4", "2025-12-01", "회고 작성", { category: "etc" }),
];

test("한국어 부분일치: '결제' 가 '결제 API','결제 버그' 모두 매칭", () => {
  const r = runSearch(SAMPLE, { q: "결제" });
  assert.deepEqual(new Set(r.map((x) => x.id)), new Set(["1", "2"]));
});

test("q 없이 필터만: 카테고리 study", () => {
  const r = runSearch(SAMPLE, { categories: ["study"] });
  assert.deepEqual(
    r.map((x) => x.id),
    ["3"],
  );
});

test("태그 OR 필터", () => {
  const r = runSearch(SAMPLE, { tags: ["nextjs", "cs"] });
  assert.deepEqual(new Set(r.map((x) => x.id)), new Set(["1", "3"]));
});

test("기간 필터 + q 조합", () => {
  const r = runSearch(SAMPLE, { q: "결제", from: "2026-02-01", to: "2026-12-31" });
  assert.deepEqual(
    r.map((x) => x.id),
    ["2"],
  );
});

test("q 없이 전체는 날짜 내림차순", () => {
  const r = runSearch(SAMPLE, {});
  assert.deepEqual(
    r.map((x) => x.id),
    ["3", "2", "1", "4"],
  );
});
