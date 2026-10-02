// 달력 계산. 전부 "YYYY-MM-DD" / "YYYY-MM" 문자열 기반, 순수 날짜 연산이라 UTC 로 안전.
import { shiftDate } from "./time";

/** ISO 8601 주차 "YYYY-Www". 주는 월요일 시작, 1주는 첫 목요일이 든 주. */
export function isoWeek(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  const dow = (dt.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  dt.setUTCDate(dt.getUTCDate() - dow + 3); // 그 주의 목요일로 이동
  const weekYear = dt.getUTCFullYear();
  const firstThu = new Date(Date.UTC(weekYear, 0, 4));
  const firstDow = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstDow + 3);
  const week = 1 + Math.round((dt.getTime() - firstThu.getTime()) / (7 * 86_400_000));
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

/** "YYYY-MM" 의 1일. */
export function firstOfMonth(month: string): string {
  return `${month}-01`;
}

/** 전/다음 달 "YYYY-MM". */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y! * 12 + (m! - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function monthOfDate(date: string): string {
  return date.slice(0, 7);
}

/**
 * 월 그리드. 월요일 시작, 그 달을 덮는 주(week) 배열. 각 주는 7개 날짜(앞뒤 달 포함).
 */
export function monthGrid(month: string): string[][] {
  const first = firstOfMonth(month);
  const [y, m] = month.split("-").map(Number);
  const firstDow = (new Date(Date.UTC(y!, m! - 1, 1)).getUTCDay() + 6) % 7; // Mon=0
  let cursor = shiftDate(first, -firstDow); // 그리드 시작(월요일)

  const weeks: string[][] = [];
  // 그 달의 마지막 날을 넘어 그 주 끝까지 채운다.
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const last = `${month}-${String(lastDay).padStart(2, "0")}`;

  while (true) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = shiftDate(cursor, 1);
    }
    weeks.push(week);
    // 방금 채운 주가 마지막 날을 포함했으면 종료.
    if (week[6]! >= last) break;
    // 안전장치: 6주 넘으면 중단.
    if (weeks.length >= 6) break;
  }
  return weeks;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${y}년 ${m}월`;
}

/** ISO 주 "YYYY-Www" 에 속한 월~일 7개 날짜("YYYY-MM-DD"). */
export function isoWeekDates(isoWeekKey: string): string[] {
  const [yStr, wStr] = isoWeekKey.split("-W");
  const year = Number(yStr);
  const week = Number(wStr);
  // ISO: 1월 4일이 속한 주가 1주. 그 주 월요일 + (week-1)*7.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = (jan4.getUTCDay() + 6) % 7; // Mon=0
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Dow + (week - 1) * 7);
  const base = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}`;
  return Array.from({ length: 7 }, (_, i) => shiftDate(base, i));
}
