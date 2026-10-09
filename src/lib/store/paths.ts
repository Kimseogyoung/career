// 날짜 키 ↔ 원격 파일 경로 변환. 전부 문자열 기반(Date 객체를 넘기지 않는다).

export function monthOf(date: string): string {
  // "2026-10-01" -> "2026-10"
  return date.slice(0, 7);
}

export function yearOf(monthOrDate: string): string {
  return monthOrDate.slice(0, 4);
}

export function monthFilePath(month: string): string {
  return `journal/${yearOf(month)}/${month}.json`;
}

export function weeklySummaryPath(isoWeek: string): string {
  // "2026-W40"
  return `summaries/weekly/${isoWeek}.json`;
}

export function monthlySummaryPath(month: string): string {
  return `summaries/monthly/${month}.json`;
}

export const INDEX_PATH = "index.json";
export const SETTINGS_PATH = "settings.json";
// 커리어 메타데이터(성과 모음). 기록(journal/)과 섞지 않도록 meta/ 아래 둔다.
export const ACHIEVEMENTS_PATH = "meta/achievements.json";
