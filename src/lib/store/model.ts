// 순수 함수: 월 파일/인덱스에 연산을 적용하고 인덱스 엔트리를 계산한다.
// 네트워크·파일시스템을 모르기 때문에 단위 테스트가 쉽다.
import type { DayRecord, IndexDay, IndexFile, MonthFile, QueueOp } from "./types";
import { monthOf } from "./paths";

export function emptyMonth(month: string): MonthFile {
  return { month, version: 1, days: {} };
}

export function emptyIndex(): IndexFile {
  return { version: 1, updatedAt: "", days: {}, weeks: {}, months: {} };
}

/** 월 파일 JSON 파싱. 형태가 깨졌으면 빈 월로 간주(원격이 비었거나 최초). */
export function parseMonth(text: string | null, month: string): MonthFile {
  if (!text) return emptyMonth(month);
  try {
    const parsed = JSON.parse(text) as MonthFile;
    if (parsed && parsed.days && typeof parsed.days === "object") {
      return { month, version: 1, days: parsed.days };
    }
  } catch {
    // 손상된 경우. 호출 측에서 덮어쓰기 전에 로깅할 수 있다.
  }
  return emptyMonth(month);
}

export function parseIndex(text: string | null): IndexFile {
  if (!text) return emptyIndex();
  try {
    const parsed = JSON.parse(text) as IndexFile;
    if (parsed && parsed.days) {
      return {
        version: 1,
        updatedAt: parsed.updatedAt ?? "",
        days: parsed.days ?? {},
        weeks: parsed.weeks ?? {},
        months: parsed.months ?? {},
      };
    }
  } catch {
    /* 빈 인덱스로 */
  }
  return emptyIndex();
}

function sortEntries(day: DayRecord): void {
  day.entries.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

/** 월 파일 하나에 해당하는 연산들을 순서대로 적용한다(불변식: 입력을 변형하지 않고 새 객체 반환). */
export function applyOpsToMonth(base: MonthFile, ops: QueueOp[]): MonthFile {
  const days: Record<string, DayRecord> = structuredClone(base.days);

  for (const op of ops) {
    if (op.op === "upsertEntry") {
      const day = (days[op.date] ??= { entries: [] });
      const idx = day.entries.findIndex((e) => e.id === op.entry.id);
      if (idx >= 0) day.entries[idx] = op.entry;
      else day.entries.push(op.entry);
      sortEntries(day);
    } else if (op.op === "deleteEntry") {
      const day = days[op.date];
      if (day) {
        day.entries = day.entries.filter((e) => e.id !== op.entryId);
        // 엔트리도 요약도 없으면 날짜 키 자체를 제거한다.
        if (day.entries.length === 0 && !day.summary) delete days[op.date];
      }
    } else if (op.op === "putSummary" && op.scope === "day") {
      // 일 요약은 key 가 곧 날짜("2026-10-01").
      const day = (days[op.key] ??= { entries: [] });
      day.summary = op.summary;
    }
    // week/month 요약은 월 파일이 아니라 별도 파일 → 여기서 처리하지 않는다.
  }

  return { month: base.month, version: 1, days };
}

const HOUR = 60;

/** "09:00" -> 분. 잘못된 형식은 0. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  const hh = Number(h),
    mm = Number(m);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return 0;
  return hh * HOUR + mm;
}

function dayDurationHours(day: DayRecord): number {
  let minutes = 0;
  for (const e of day.entries) {
    const d = toMinutes(e.end) - toMinutes(e.start);
    if (d > 0) minutes += d;
  }
  return minutes / HOUR;
}

/** 달력 셀에 보일 한 줄(최대 80자). 요약 첫 줄 > 첫 엔트리 내용 순. */
export function dayHead(day: DayRecord): string {
  const source = day.summary?.text?.trim() || day.entries[0]?.content?.trim() || "";
  const firstLine = source.split("\n")[0] ?? "";
  return firstLine.length > 80 ? firstLine.slice(0, 80) : firstLine;
}

export function indexDayOf(day: DayRecord): IndexDay {
  const categories = [...new Set(day.entries.map((e) => e.category))];
  // 최다 카테고리와 그 횟수(연 보기 색조·명도). 동점이면 먼저 나온 것.
  const counts = new Map<string, number>();
  let top: DayRecord["entries"][number]["category"] | null = null;
  let topCount = 0;
  for (const e of day.entries) {
    const n = (counts.get(e.category) ?? 0) + 1;
    counts.set(e.category, n);
    if (n > topCount) {
      topCount = n;
      top = e.category;
    }
  }
  return {
    head: dayHead(day),
    count: day.entries.length,
    categories,
    hasSummary: Boolean(day.summary?.text?.trim()),
    top,
    topCount,
  };
}

/** 월 파일 상태를 반영해 인덱스의 해당 날짜·월 항목을 다시 계산한다(새 인덱스 반환). */
export function reindexMonth(index: IndexFile, month: MonthFile, updatedAt: string): IndexFile {
  const days = { ...index.days };
  const prefix = month.month; // "2026-10"

  // 이 월에 속한 기존 날짜 항목을 걷어내고 현재 상태로 다시 채운다.
  for (const key of Object.keys(days)) {
    if (monthOf(key) === prefix) delete days[key];
  }
  let totalHours = 0;
  let monthHasSummary = false;
  for (const [date, day] of Object.entries(month.days)) {
    days[date] = indexDayOf(day);
    totalHours += dayDurationHours(day);
    if (day.summary?.text?.trim()) monthHasSummary = true;
  }

  const months = { ...index.months, [prefix]: { hasSummary: monthHasSummary, totalHours } };
  return { version: 1, updatedAt, days, weeks: { ...index.weeks }, months };
}
