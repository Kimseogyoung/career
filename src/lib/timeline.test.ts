import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDayLayout, previousEntry, recentActivities, toMin } from "./timeline";
import type { DayRecord, Entry, RecordingHours } from "./store/types";

const REC: RecordingHours = { start: "09:00", end: "18:00" };

function e(id: string, start: string, end: string, extra: Partial<Entry> = {}): Entry {
  return {
    id,
    start,
    end,
    category: extra.category ?? "work",
    tags: extra.tags ?? [],
    content: extra.content ?? "",
    createdAt: "2026-10-01T09:00:00+09:00",
    updatedAt: "2026-10-01T09:00:00+09:00",
  };
}

test("겹치지 않으면 모두 단독 열(ncols=1)", () => {
  const { items } = computeDayLayout([e("1", "09:00", "11:00"), e("2", "11:00", "12:00")], REC);
  assert.deepEqual(
    items.map((i) => i.ncols),
    [1, 1],
  );
});

test("두 건 겹치면 2열, 세 건 겹치면 3열", () => {
  const two = computeDayLayout([e("a", "09:00", "10:00"), e("b", "09:30", "10:30")], REC);
  assert.equal(two.items[0]!.ncols, 2);
  assert.deepEqual(new Set(two.items.map((i) => i.col)), new Set([0, 1]));

  const three = computeDayLayout(
    [e("a", "11:00", "11:45"), e("b", "11:00", "11:30"), e("c", "11:15", "11:45")],
    REC,
  );
  assert.equal(Math.max(...three.items.map((i) => i.ncols)), 3);
  assert.ok(three.items.every((i) => !i.overflow), "3열까지는 overflow 없음");
});

test("4건 이상 동시 겹침: 앞 3열만 보이고 나머지는 overflow(+N)", () => {
  const layout = computeDayLayout(
    [
      e("a", "12:00", "12:45"),
      e("b", "12:00", "12:30"),
      e("c", "12:00", "12:30"),
      e("d", "12:10", "12:40"),
      e("e", "12:15", "12:45"),
    ],
    REC,
  );
  const overflow = layout.items.filter((i) => i.overflow);
  assert.equal(overflow.length, 2, "5건 중 2건이 접힘");
  assert.equal(layout.clusters[0]!.overflowCount, 2);
  assert.equal(layout.clusters[0]!.entries.length, 5);
});

test("빈 앞/뒤 구간은 접고(dawn/eve), 창은 기록 시간대 ∪ 엔트리", () => {
  // 기록 시간대만 있을 때: 09~18 창, 00~09 새벽 / 18~24 저녁 접힘
  const empty = computeDayLayout([], REC);
  assert.equal(empty.startMin, toMin("09:00"));
  assert.equal(empty.endMin, toMin("18:00"));
  assert.deepEqual(empty.dawn, { from: 0, to: 540 });
  assert.deepEqual(empty.eve, { from: 1080, to: 1440 });

  // 이른/늦은 엔트리가 있으면 창이 늘어난다
  const wide = computeDayLayout([e("1", "07:30", "08:00"), e("2", "20:00", "21:30")], REC);
  assert.equal(wide.startMin, toMin("07:00"), "07:30 포함 → 07:00 로 확장");
  assert.equal(wide.endMin, toMin("22:00"), "21:30 포함 → 22:00 로 확장");
});

test("recentActivities: 날짜 이하에서 (카테고리+내용) 중복 제거, 최신순", () => {
  const days: Record<string, DayRecord> = {
    "2026-10-01": { entries: [e("1", "09:00", "10:00", { content: "A", category: "work" })] },
    "2026-10-02": {
      entries: [
        e("2", "09:00", "10:00", { content: "A", category: "work" }), // 중복
        e("3", "10:00", "11:00", { content: "B", category: "study" }),
      ],
    },
    "2026-10-03": { entries: [e("4", "09:00", "10:00", { content: "C", category: "meeting" })] },
  };
  const r = recentActivities(days, "2026-10-02");
  assert.deepEqual(
    r.map((x) => x.content),
    ["B", "A"],
    "10-03 은 upToDate 초과라 제외, 최신(10-02)부터",
  );
});

test("previousEntry: 주어진 시각 직전 시작 엔트리", () => {
  const list = [e("1", "09:00", "10:00"), e("2", "10:00", "11:00"), e("3", "13:00", "14:00")];
  assert.equal(previousEntry(list, toMin("12:00"))?.id, "2");
  assert.equal(previousEntry(list, toMin("09:00")), null, "그 이전 시작은 없음");
});
