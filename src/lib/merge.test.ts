import { test } from "node:test";
import assert from "node:assert/strict";
import { contentKey, mergeEntries } from "./merge";
import type { Entry } from "./store/types";

const NOW = "2026-10-01T12:00:00+09:00";

function e(id: string, start: string, end: string, extra: Partial<Entry> = {}): Entry {
  return {
    id,
    start,
    end,
    category: extra.category ?? "work",
    tags: extra.tags ?? [],
    content: extra.content ?? "A",
    createdAt: extra.createdAt ?? "2026-10-01T09:00:00+09:00",
    updatedAt: "2026-10-01T09:00:00+09:00",
  };
}

test("같은 내용이 맞닿으면 하나로 합친다(편집 id 유지)", () => {
  const plan = mergeEntries([e("1", "09:00", "10:00"), e("2", "10:00", "11:00")], "2", NOW);
  assert.ok(plan);
  assert.equal(plan!.merged.id, "2");
  assert.equal(plan!.merged.start, "09:00");
  assert.equal(plan!.merged.end, "11:00");
  assert.deepEqual(plan!.removeIds, ["1"]);
  assert.equal(plan!.merged.createdAt, "2026-10-01T09:00:00+09:00");
});

test("사이에 빈 시간이 있으면 합치지 않는다", () => {
  const plan = mergeEntries([e("1", "09:00", "10:00"), e("2", "11:00", "12:00")], "2", NOW);
  assert.equal(plan, null);
});

test("내용이 다르면 맞닿아도 합치지 않는다", () => {
  const plan = mergeEntries(
    [e("1", "09:00", "10:00", { content: "A" }), e("2", "10:00", "11:00", { content: "B" })],
    "2",
    NOW,
  );
  assert.equal(plan, null);
});

test("태그는 순서/중복 무관하게 같으면 합친다", () => {
  const plan = mergeEntries(
    [
      e("1", "09:00", "10:00", { tags: ["x", "y"] }),
      e("2", "10:00", "11:00", { tags: ["y", "x", "x"] }),
    ],
    "2",
    NOW,
  );
  assert.ok(plan);
  assert.equal(plan!.merged.end, "11:00");
});

test("세 칸 연속이면 연쇄로 모두 합친다", () => {
  const plan = mergeEntries(
    [e("1", "09:00", "10:00"), e("2", "10:00", "11:00"), e("3", "11:00", "12:00")],
    "2",
    NOW,
  );
  assert.ok(plan);
  assert.equal(plan!.merged.start, "09:00");
  assert.equal(plan!.merged.end, "12:00");
  assert.deepEqual(plan!.removeIds.sort(), ["1", "3"]);
});

test("겹치는 같은 내용도 범위를 합친다", () => {
  const plan = mergeEntries([e("1", "09:00", "10:30"), e("2", "10:00", "11:00")], "1", NOW);
  assert.ok(plan);
  assert.equal(plan!.merged.start, "09:00");
  assert.equal(plan!.merged.end, "11:00");
});

test("contentKey 는 시간을 무시한다", () => {
  assert.equal(contentKey(e("1", "09:00", "10:00")), contentKey(e("2", "15:00", "16:00")));
});
