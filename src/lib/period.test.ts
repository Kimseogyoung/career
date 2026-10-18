import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareRecent,
  formatDuration,
  monthsInclusive,
  parseLegacyPeriod,
  parseYearMonth,
  totalMonths,
  validatePeriod,
} from "./period";

test("월 파싱: 여러 표기 → YYYY-MM, 연도만·잘못된 달은 null", () => {
  assert.equal(parseYearMonth("2024.01"), "2024-01");
  assert.equal(parseYearMonth("2024-1"), "2024-01");
  assert.equal(parseYearMonth("2024/12"), "2024-12");
  assert.equal(parseYearMonth("2024년 3월"), "2024-03");
  assert.equal(parseYearMonth("2024"), null);
  assert.equal(parseYearMonth("2024.13"), null);
  assert.equal(parseYearMonth(""), null);
});

test("마이그레이션: 'yyyy.mm - 현재' / 'yyyy.mm - yyyy.mm'", () => {
  assert.deepEqual(parseLegacyPeriod("2024.01 – 현재"), {
    start: "2024-01",
    end: null,
    current: true,
    startNote: undefined,
    endNote: "현재",
  });
  assert.deepEqual(parseLegacyPeriod("2022.07 - 2023.12"), {
    start: "2022-07",
    end: "2023-12",
    current: false,
    startNote: undefined,
    endNote: undefined,
  });
  assert.deepEqual(parseLegacyPeriod("2024-01 - 2024-05"), {
    start: "2024-01",
    end: "2024-05",
    current: false,
    startNote: undefined,
    endNote: undefined,
  });
  assert.equal(parseLegacyPeriod("2025.03 ~ 개발 중").current, true);
});

test("마이그레이션: 종료 뒤 코멘트 분리('출시')", () => {
  const p = parseLegacyPeriod("2023.01 ~ 2024.05 출시");
  assert.equal(p.end, "2024-05");
  assert.equal(p.endNote, "출시");
});

test("마이그레이션: 시작 코멘트·붙여 쓴 '진행중/개발중'·괄호 코멘트 (실데이터 표기)", () => {
  const a = parseLegacyPeriod("2026.07(합류일) – 개발중");
  assert.equal(a.start, "2026-07");
  assert.equal(a.startNote, "합류일");
  assert.equal(a.current, true);
  const b = parseLegacyPeriod("2023.01 합류 – 2024.05 출시");
  assert.equal(b.startNote, "합류");
  assert.equal(b.end, "2024-05");
  assert.equal(b.endNote, "출시");
  assert.equal(parseLegacyPeriod("2024.09 – 진행중").current, true);
  assert.equal(parseLegacyPeriod("2023.01 – 2024.05 (출시)").endNote, "출시");
});

test("마이그레이션 실패는 start=null (원문 보존 대상)", () => {
  for (const t of ["2025 – 현재", "2021", "작년부터", "", "2024.01"]) {
    assert.equal(parseLegacyPeriod(t).start, null, t);
  }
});

test("재직 기간: 양 끝 포함 개월 수와 표기", () => {
  assert.equal(monthsInclusive("2022-07", "2023-12"), 18);
  assert.equal(monthsInclusive("2024-01", "2026-10"), 34);
  assert.equal(formatDuration(18), "1년 6개월");
  assert.equal(formatDuration(34), "2년 10개월");
  assert.equal(formatDuration(12), "1년");
  assert.equal(formatDuration(5), "5개월");
});

test("총 경력: 겹치는 기간은 한 번만", () => {
  assert.equal(
    totalMonths([
      { start: "2022-07", end: "2023-12" },
      { start: "2023-06", end: "2024-01" }, // 6~12월 겹침
    ]),
    19,
  );
});

test("정렬: 현재 → 종료 늦은 순 → 시작 늦은 순, 날짜 없는 건 맨 아래", () => {
  const items = [
    { id: "old", start: "2019-03", end: "2020-01" },
    { id: "none" },
    { id: "cur", start: "2024-01", current: true },
    { id: "mid", start: "2022-07", end: "2023-12" },
    { id: "mid2", start: "2023-01", end: "2023-12" },
  ];
  assert.deepEqual(
    [...items].sort(compareRecent).map((x) => x.id),
    ["cur", "mid2", "mid", "old", "none"],
  );
});

test("검증: 시작 필수, 종료<시작 불가, 경력은 미래 불가·프로젝트 종료는 미래 허용", () => {
  const now = "2026-10";
  assert.equal(validatePeriod({}, now), "start_required");
  assert.equal(validatePeriod({ start: "2024-05", end: "2024-01" }, now), "end_before_start");
  assert.equal(validatePeriod({ start: "2027-01" }, now), "future");
  assert.equal(validatePeriod({ start: "2026-01", end: "2026-12" }, now), "future");
  assert.equal(validatePeriod({ start: "2026-01", end: "2026-12" }, now, { allowFutureEnd: true }), null);
  assert.equal(validatePeriod({ start: "2024-01", current: true }, now), null);
});
