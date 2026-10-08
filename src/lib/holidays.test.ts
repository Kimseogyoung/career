import { test } from "node:test";
import assert from "node:assert/strict";
import { dayColor, holidayName } from "./holidays";

test("고정 공휴일은 모든 연도에 적용", () => {
  assert.equal(holidayName("2030-01-01"), "신정");
  assert.equal(holidayName("2027-10-09"), "한글날");
  assert.equal(holidayName("2028-12-25"), "성탄절");
});

test("2026 설날·추석 연휴(당일 ±1일)", () => {
  assert.equal(holidayName("2026-02-16"), "설날");
  assert.equal(holidayName("2026-02-17"), "설날");
  assert.equal(holidayName("2026-02-18"), "설날");
  assert.equal(holidayName("2026-09-24"), "추석");
  assert.equal(holidayName("2026-09-25"), "추석");
  assert.equal(holidayName("2026-09-26"), "추석");
});

test("2026 대체공휴일: 삼일절(일)→3/2, 부처님오신날(일)→5/25", () => {
  assert.equal(holidayName("2026-03-01"), "삼일절");
  assert.equal(holidayName("2026-03-02"), "대체공휴일");
  assert.equal(holidayName("2026-05-24"), "부처님오신날");
  assert.equal(holidayName("2026-05-25"), "대체공휴일");
});

test("2025 겹침/주말 대체: 어린이날=부처님(5/5)→5/6, 삼일절(토 3/1)→3/3", () => {
  assert.equal(holidayName("2025-05-06"), "대체공휴일");
  assert.equal(holidayName("2025-03-03"), "대체공휴일");
});

test("음력 데이터 없는 연도도 고정 공휴일은 나오고 크래시 없음", () => {
  assert.equal(holidayName("2099-08-15"), "광복절");
  assert.equal(holidayName("2099-07-01"), null);
});

test("dayColor: 공휴일>일요일>토요일>평일", () => {
  assert.equal(dayColor("2026-01-01"), "holiday"); // 신정
  assert.equal(dayColor("2026-10-11"), "sun"); // 일요일
  assert.equal(dayColor("2026-10-10"), "sat"); // 토요일
  assert.equal(dayColor("2026-10-08"), "none"); // 평일(목)
});
