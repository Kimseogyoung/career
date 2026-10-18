// 경력·프로젝트 기간(월 단위) 유틸. 서버·클라이언트 공용 순수 함수. (ADR-015)
// 날짜는 "YYYY-MM" 문자열로만 다룬다. 이력서 관례대로 월 단위 — 기억이 흐린 과거에 가짜 정밀도를 만들지 않는다.

export type YearMonth = string; // "2024-01"

const YM_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isYearMonth(v: unknown): v is YearMonth {
  return typeof v === "string" && YM_RE.test(v);
}

/** "2024.01", "2024-1", "2024/01", "2024년 1월" → "2024-01". 연도만 있거나 해석 불가면 null. */
export function parseYearMonth(raw: string | null | undefined): YearMonth | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{4})\s*(?:[.\-/]|년)\s*(\d{1,2})\s*월?$/);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-${String(month).padStart(2, "0")}`;
}

/** "2024-01" → "2024.01" */
export function formatYearMonth(ym: YearMonth): string {
  return ym.replace("-", ".");
}

/** KST 기준 이번 달. */
export function currentYearMonth(today: string): YearMonth {
  return today.slice(0, 7); // today = "YYYY-MM-DD"(KST)
}

function index(ym: YearMonth): number {
  return Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
}

/** 시작·종료 월을 모두 포함한 개월 수. 2022-07 ~ 2023-12 → 18. 종료가 시작보다 앞이면 0. */
export function monthsInclusive(start: YearMonth, end: YearMonth): number {
  return Math.max(0, index(end) - index(start) + 1);
}

/** 18 → "1년 6개월", 12 → "1년", 5 → "5개월". */
export function formatDuration(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y && m) return `${y}년 ${m}개월`;
  if (y) return `${y}년`;
  return `${m}개월`;
}

const CURRENT_WORDS = /^(현재|재직\s*중|재직|진행\s*중|진행|개발\s*중|운영\s*중|서비스\s*중|now|present|current)$/i;

export interface ParsedPeriod {
  start: YearMonth | null;
  end: YearMonth | null;
  current: boolean; // 종료가 "현재/진행 중" 류
  startNote?: string; // 시작 뒤에 붙은 말(예: "2026.07(합류일)" → "합류일")
  endNote?: string; // 종료 뒤에 붙은 말(예: "2024.05 출시" → "출시")
}

/** "(출시)" → "출시". 빈 값은 undefined. */
function noteOf(s: string | undefined): string | undefined {
  const t = s?.trim().replace(/^\((.*)\)$/, "$1").trim();
  return t || undefined;
}

/**
 * 예전 자유 글자 기간을 구조화한다(마이그레이션). 실패하면 start 가 null.
 * "2024.01 – 현재", "2022.07 - 2023.12", "2023.01 ~ 2024.05 출시", "2025.03 – 개발 중"
 */
export function parseLegacyPeriod(text: string | null | undefined): ParsedPeriod {
  const fail: ParsedPeriod = { start: null, end: null, current: false };
  if (!text) return fail;
  // 시작 날짜를 먼저 잡아야 "2024-01 - 2024-05" 의 날짜 속 '-' 와 구분자가 섞이지 않는다.
  // 시작 뒤 코멘트: "2026.07(합류일) – …", "2023.01 합류 – …"
  const head = text
    .trim()
    .match(/^(\d{4}\s*(?:[.\-/]|년)\s*\d{1,2}\s*월?)\s*(\([^)]*\)|[^–—~\-\d][^–—~\-]*?)?\s*[–—~\-]\s*(.+)$/);
  if (!head) return fail;
  const start = parseYearMonth(head[1]);
  if (!start) return fail;
  const startNote = noteOf(head[2]);
  const rest = head[3]!.trim();
  const restWord = noteOf(rest) ?? "";
  if (CURRENT_WORDS.test(restWord)) return { start, end: null, current: true, startNote, endNote: restWord };
  const m = rest.match(/^(\d{4}\s*(?:[.\-/]|년)\s*\d{1,2}\s*월?)\s*(.*)$/);
  if (!m) return fail;
  const end = parseYearMonth(m[1]);
  if (!end) return fail;
  return { start, end, current: false, startNote, endNote: noteOf(m[2]) };
}

/** 겹치는 기간을 한 번만 세는 총 개월 수(분사·겸직처럼 겹쳐도 중복 없이). */
export function totalMonths(ranges: { start: YearMonth; end: YearMonth }[]): number {
  const months = new Set<number>();
  for (const r of ranges) {
    for (let i = index(r.start); i <= index(r.end); i++) months.add(i);
  }
  return months.size;
}

/**
 * 최신순 정렬 키. 진행 중(현재)이 맨 위, 그다음 종료가 늦은 순, 같으면 시작이 늦은 순.
 * 날짜가 없는 항목(마이그레이션 실패)은 맨 아래.
 */
export function compareRecent(
  a: { start?: YearMonth | null; end?: YearMonth | null; current?: boolean },
  b: { start?: YearMonth | null; end?: YearMonth | null; current?: boolean },
): number {
  const key = (x: typeof a): [number, string, string] => {
    if (!x.start && !x.end) return [0, "", ""];
    return [1, x.current ? "9999-12" : (x.end ?? x.start ?? ""), x.start ?? ""];
  };
  const [ha, ea, sa] = key(a);
  const [hb, eb, sb] = key(b);
  if (ha !== hb) return hb - ha;
  if (ea !== eb) return eb.localeCompare(ea);
  return sb.localeCompare(sa);
}

export type PeriodError = "start_required" | "end_before_start" | "future";

/** 입력 검증. 경력은 미래 날짜 불가, 프로젝트는 종료(출시 예정 등)에 미래 허용. */
export function validatePeriod(
  p: { start?: YearMonth | null; end?: YearMonth | null; current?: boolean },
  now: YearMonth,
  opts: { allowFutureEnd?: boolean } = {},
): PeriodError | null {
  if (!p.start) return "start_required";
  if (p.start > now) return "future";
  if (!p.current && p.end) {
    if (p.end < p.start) return "end_before_start";
    if (!opts.allowFutureEnd && p.end > now) return "future";
  }
  return null;
}
