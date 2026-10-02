import { test } from "node:test";
import assert from "node:assert/strict";
import { isoWeek, monthGrid, shiftMonth, monthOfDate } from "./calendar";

test("ISO 주차 계산", () => {
  assert.equal(isoWeek("2026-01-01"), "2026-W01"); // 2026-01-01 은 목요일 → W01
  assert.equal(isoWeek("2026-10-02"), "2026-W40");
});

test("월 그리드는 월요일 시작, 그 달을 모두 포함", () => {
  const weeks = monthGrid("2026-10");
  assert.equal(weeks[0]!.length, 7);
  // 10월의 모든 날짜가 그리드 안에 있어야
  for (let d = 1; d <= 31; d++) {
    const date = `2026-10-${String(d).padStart(2, "0")}`;
    assert.ok(
      weeks.some((w) => w.includes(date)),
      `${date} 포함`,
    );
  }
  // 첫 셀은 월요일
  assert.equal(new Date(weeks[0]![0] + "T00:00:00Z").getUTCDay(), 1, "첫 칸=월요일");
});

test("shiftMonth 는 연 경계를 넘는다", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
});

test("monthOfDate", () => {
  assert.equal(monthOfDate("2026-10-02"), "2026-10");
});
