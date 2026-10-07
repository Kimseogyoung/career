// 한국 공휴일 + 요일 색. 날짜 색상 규칙(한국 달력): 공휴일·일요일=빨강, 토요일=파랑.
//
// 양력 고정 공휴일은 매년 적용. 음력(설·추석·부처님오신날)과 대체공휴일은 연도별 표로 관리한다.
// 실제 운영에선 연초에 공공데이터포털 '특일정보'로 받아 데이터 레포에 캐시하는 것을 권장
// (여기 하드코딩 표는 그 전까지의 기본값이자 폴백).

const FIXED: Record<string, string> = {
  "1-1": "신정",
  "3-1": "삼일절",
  "5-5": "어린이날",
  "6-6": "현충일",
  "8-15": "광복절",
  "10-3": "개천절",
  "10-9": "한글날",
  "12-25": "성탄절",
};

// 연도별(음력·대체공휴일). 필요 연도를 추가해 나간다.
const BY_YEAR: Record<number, Record<string, string>> = {
  2026: {
    "2-16": "설날",
    "2-17": "설날",
    "2-18": "설날",
    "3-2": "대체공휴일",
    "5-24": "부처님오신날",
    "5-25": "대체공휴일",
    "9-24": "추석",
    "9-25": "추석",
    "9-26": "추석",
  },
};

/** "YYYY-MM-DD" → 공휴일명 또는 null. */
export function holidayName(date: string): string | null {
  const [y, m, d] = date.split("-").map(Number);
  const key = `${m}-${d}`;
  const yearly = BY_YEAR[y!];
  if (yearly && yearly[key]) return yearly[key]!;
  return FIXED[key] ?? null;
}

export type DayColor = "holiday" | "sun" | "sat" | "none";

/** 날짜의 색 분류. 공휴일 > 일요일 > 토요일 > 평일. */
export function dayColor(date: string): DayColor {
  if (holidayName(date)) return "holiday";
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  if (dow === 0) return "sun";
  if (dow === 6) return "sat";
  return "none";
}
