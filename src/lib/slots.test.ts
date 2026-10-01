import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSlots } from "./slots";
import type { Entry } from "./store/types";

function entry(start: string, end: string): Entry {
  return {
    id: start,
    start,
    end,
    category: "work",
    tags: [],
    content: "",
    createdAt: "",
    updatedAt: "",
  };
}

const hours = { start: "09:00", end: "18:00" };

test("기록 시간대 안의 매 시각마다 슬롯을 만든다", () => {
  const slots = buildSlots(hours, []);
  assert.equal(slots.length, 9, "09~17시 = 9개");
  assert.equal(slots[0]!.start, "09:00");
  assert.equal(slots.at(-1)!.start, "17:00");
});

test("기록 시간대 밖이라도 엔트리가 있으면 슬롯을 추가한다", () => {
  const slots = buildSlots(hours, [entry("22:00", "23:00")]);
  assert.ok(
    slots.some((s) => s.start === "22:00"),
    "야근 시각 슬롯이 추가됨",
  );
});

test("엔트리는 시작 시(hour)가 같은 슬롯에 들어간다", () => {
  const slots = buildSlots(hours, [entry("09:30", "10:00"), entry("09:00", "09:30")]);
  const nine = slots.find((s) => s.start === "09:00")!;
  assert.equal(nine.entries.length, 2);
  assert.equal(nine.entries[0]!.start, "09:00", "슬롯 내에서 start 오름차순");
});

test("슬롯은 시각 오름차순으로 정렬된다", () => {
  const slots = buildSlots(hours, [entry("06:00", "07:00")]);
  const starts = slots.map((s) => s.start);
  assert.deepEqual([...starts].sort(), starts, "오름차순");
  assert.equal(starts[0], "06:00", "이른 시각이 맨 앞");
});
