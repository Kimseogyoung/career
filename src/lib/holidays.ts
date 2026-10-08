// 한국 공휴일 + 요일 색. 날짜 색상 규칙(한국 달력): 공휴일·일요일=빨강, 토요일=파랑.
//
// 양력 고정 공휴일은 매년 적용. 음력(설·추석)과 부처님오신날은 "당일"만 연도별로 두고,
// 설·추석 3일 연휴와 대체공휴일은 규칙으로 계산한다(손으로 날짜를 틀리게 적는 위험 제거).
// 연도별 음력 당일은 공공데이터포털 '특일정보'로 연초에 갱신 권장(여기 표는 기본값·폴백).
//
// 대체공휴일 규칙:
//  - 어린이날: 토·일 또는 다른 공휴일과 겹치면 대체.
//  - 설날·추석 연휴: 일요일 또는 다른 공휴일과 겹치면 대체.
//  - 삼일절·광복절·개천절·한글날·부처님오신날·성탄절: 토·일과 겹치면 대체.
//  - 신정·현충일: 대체 없음.
//  대체일 = 그 다음 날부터 "공휴일도 일요일도 아닌" 첫 날(이미 밀린 대체일도 건너뜀).

const FIXED_NAMES: Record<string, string> = {
  "1-1": "신정",
  "3-1": "삼일절",
  "5-5": "어린이날",
  "6-6": "현충일",
  "8-15": "광복절",
  "10-3": "개천절",
  "10-9": "한글날",
  "12-25": "성탄절",
};

// 음력 설날·추석의 "당일"(그 날)과 부처님오신날(양력). 연휴는 당일 ±1일로 만든다.
const LUNAR: Record<number, { seollal: string; buddha: string; chuseok: string }> = {
  2025: { seollal: "2025-01-29", buddha: "2025-05-05", chuseok: "2025-10-06" },
  2026: { seollal: "2026-02-17", buddha: "2026-05-24", chuseok: "2026-09-25" },
  2027: { seollal: "2027-02-07", buddha: "2027-05-13", chuseok: "2027-09-15" },
  2028: { seollal: "2028-01-27", buddha: "2028-05-02", chuseok: "2028-10-03" },
  2029: { seollal: "2029-02-13", buddha: "2029-05-20", chuseok: "2029-09-22" },
  2030: { seollal: "2030-02-03", buddha: "2030-05-09", chuseok: "2030-09-12" },
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dow(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

// 이름 + 요일 + 겹침 여부로 대체공휴일 대상인지.
function triggersSubstitute(name: string, wd: number, overlapped: boolean): boolean {
  if (name === "어린이날") return wd === 0 || wd === 6 || overlapped;
  if (name === "설날" || name === "추석") return wd === 0 || overlapped;
  if (
    name === "삼일절" ||
    name === "광복절" ||
    name === "개천절" ||
    name === "한글날" ||
    name === "부처님오신날" ||
    name === "성탄절"
  ) {
    return wd === 0 || wd === 6;
  }
  return false; // 신정, 현충일
}

const cache = new Map<number, Map<string, string>>();

function yearHolidays(year: number): Map<string, string> {
  const cached = cache.get(year);
  if (cached) return cached;

  const list: { date: string; name: string }[] = [];
  for (const [key, name] of Object.entries(FIXED_NAMES)) {
    const [m, d] = key.split("-").map(Number);
    list.push({ date: `${year}-${pad(m!)}-${pad(d!)}`, name });
  }
  const lu = LUNAR[year];
  if (lu) {
    for (const off of [-1, 0, 1]) {
      list.push({ date: addDays(lu.seollal, off), name: "설날" });
      list.push({ date: addDays(lu.chuseok, off), name: "추석" });
    }
    list.push({ date: lu.buddha, name: "부처님오신날" });
  }

  const count = new Map<string, number>();
  for (const h of list) count.set(h.date, (count.get(h.date) ?? 0) + 1);

  const result = new Map<string, string>();
  for (const h of list) if (!result.has(h.date)) result.set(h.date, h.name);

  const blocked = (iso: string) => result.has(iso) || dow(iso) === 0;

  for (const h of [...list].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const overlapped = (count.get(h.date) ?? 0) > 1;
    if (!triggersSubstitute(h.name, dow(h.date), overlapped)) continue;
    let cur = addDays(h.date, 1);
    while (blocked(cur)) cur = addDays(cur, 1);
    if (!result.has(cur)) result.set(cur, "대체공휴일");
  }

  cache.set(year, result);
  return result;
}

/** "YYYY-MM-DD" → 공휴일명 또는 null. 음력 데이터가 없는 연도도 고정 공휴일은 반영된다. */
export function holidayName(date: string): string | null {
  return yearHolidays(Number(date.slice(0, 4))).get(date) ?? null;
}

export type DayColor = "holiday" | "sun" | "sat" | "none";

/** 날짜의 색 분류. 공휴일 > 일요일 > 토요일 > 평일. */
export function dayColor(date: string): DayColor {
  if (holidayName(date)) return "holiday";
  const wd = dow(date);
  if (wd === 0) return "sun";
  if (wd === 6) return "sat";
  return "none";
}
