// 하루를 1시간 슬롯으로 나눈다. 기록 시간대(설정) 안의 슬롯을 기본으로 보여주고,
// 그 밖의 시간에 이미 기록이 있으면 함께 노출한다(야근·새벽 공부).
import type { Entry, RecordingHours } from "@/lib/store/types";

export interface Slot {
  start: string; // "09:00"
  end: string; // "10:00"
  entries: Entry[]; // 이 슬롯 시작 시각과 겹치는 엔트리들
}

function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

/** 엔트리의 start 시각(HH:MM)에서 시(hour)만 뽑는다. */
function startHour(entry: Entry): number {
  return Number(entry.start.slice(0, 2));
}

/**
 * 슬롯 목록을 만든다.
 * - 기록 시간대 [start, end) 안의 매 시각마다 슬롯
 * - 그 밖이라도 엔트리가 있는 시각은 슬롯 추가
 */
export function buildSlots(hours: RecordingHours, entries: Entry[]): Slot[] {
  const startH = Number(hours.start.slice(0, 2));
  const endH = Number(hours.end.slice(0, 2));

  const hourSet = new Set<number>();
  for (let h = startH; h < endH; h++) hourSet.add(h);
  for (const e of entries) hourSet.add(startHour(e));

  const sorted = [...hourSet].filter((h) => h >= 0 && h <= 23).sort((a, b) => a - b);

  return sorted.map((h) => ({
    start: hourLabel(h),
    end: hourLabel(h + 1 > 23 ? 23 : h + 1),
    entries: entries.filter((e) => startHour(e) === h).sort((a, b) => (a.start < b.start ? -1 : 1)),
  }));
}
