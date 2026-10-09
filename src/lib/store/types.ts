// 원격 저장 계층의 데이터 형태. 전체 레이아웃은 docs/DATA-MODEL.md 참조.
// 날짜 키는 전부 문자열로 다룬다(일 YYYY-MM-DD, 월 YYYY-MM, 주 ISO YYYY-Www).

export type CategoryId = "work" | "study" | "meeting" | "side" | "etc";

export interface Entry {
  id: string; // ULID
  start: string; // "09:00" (KST)
  end: string; // "10:00"
  category: CategoryId;
  tags: string[];
  content: string;
  createdAt: string; // ISO8601 +09:00
  updatedAt: string;
}

export type GeneratedBy = "ai" | "manual";
export type SummaryStatus = "ok" | "failed" | "pending";

export interface Summary {
  text: string;
  generatedBy: GeneratedBy;
  model: string | null;
  generatedAt: string | null;
  editedAt: string | null;
  status: SummaryStatus;
}

export interface DayRecord {
  entries: Entry[]; // start 오름차순 유지
  summary?: Summary;
}

export interface MonthFile {
  month: string; // "2026-10"
  version: 1;
  days: Record<string, DayRecord>; // "2026-10-01" -> DayRecord
}

export interface IndexDay {
  head: string; // 요약/첫 엔트리에서 뽑은 최대 80자
  count: number;
  categories: CategoryId[];
  hasSummary: boolean;
  top?: CategoryId | null; // 그날 최다 카테고리(연 보기 색조). 구버전 인덱스엔 없을 수 있음
  topCount?: number; // 그 카테고리 횟수(연 보기 명도)
}

export interface IndexFile {
  version: 1;
  updatedAt: string;
  days: Record<string, IndexDay>;
  weeks: Record<string, { head: string; hasSummary: boolean }>;
  months: Record<string, { hasSummary: boolean; totalHours: number }>;
}

// ── 쓰기 큐 연산 ──────────────────────────────────────────────────
// 큐는 "아직 원격에 반영 안 된 변경분"만 담는다. 원격 반영 성공 시 비운다.

export interface UpsertEntryOp {
  op: "upsertEntry";
  date: string;
  entry: Entry;
  at: string;
  seq: number;
}

export interface DeleteEntryOp {
  op: "deleteEntry";
  date: string;
  entryId: string;
  at: string;
  seq: number;
}

export interface PutSummaryOp {
  op: "putSummary";
  scope: "day" | "week" | "month";
  key: string; // 일: "2026-10-01", 주: "2026-W40", 월: "2026-10"
  summary: Summary;
  at: string;
  seq: number;
}

export type QueueOp = UpsertEntryOp | DeleteEntryOp | PutSummaryOp;

// ── 설정 (settings.json) ──────────────────────────────────────────

export interface RecordingHours {
  start: string; // "09:00"
  end: string; // "18:00"
}

export interface Category {
  id: CategoryId;
  label: string;
  color: string;
}

/** 요약 프롬프트 사용자 커스텀. 비면(미지정/빈 문자열) prompts.ts 기본값을 쓴다. */
export interface SummaryPrompts {
  system?: string;
  day?: string;
  week?: string;
  month?: string;
}

/** 성과 추출 프롬프트 커스텀. JSON 출력 형식은 코드 고정이고 여기선 성격(system)·추가지침(guide)만. */
export interface AchievementPrompts {
  system?: string;
  guide?: string;
}

export interface Settings {
  version: 1;
  timezone: string;
  recordingHours: RecordingHours;
  categories: Category[];
  reminder: ReminderSettings;
  pushSubscriptions: PushSubscriptionRecord[];
  summaryPrompts?: SummaryPrompts;
  achievementPrompts?: AchievementPrompts;
}

// ── 커리어: 성과 모음 (meta/achievements.json) ──────────────────────

export interface Achievement {
  id: string; // ULID
  title: string; // 한 줄 요약(필수)
  problem?: string; // 상황/문제
  approach?: string; // 접근·방법(어떤 기술을 왜)
  result?: string; // 결과·효과(수치)
  tech: string[]; // 사용 기술
  theme?: string; // 주제 그룹
  star: boolean; // 이력서·포트폴리오 후보
  sourceDates: string[]; // 근거 날짜 "YYYY-MM-DD"
  createdBy: GeneratedBy; // ai | manual
  createdAt: string;
  updatedAt: string;
}

export interface AchievementsFile {
  version: 1;
  achievements: Achievement[];
}

export interface PushSubscriptionRecord {
  id: string;
  label: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: string;
}

export interface ReminderSettings {
  enabled: boolean;
  days: number[]; // 0=일 … 6=토
  hours: RecordingHours;
  skipIfRecorded: boolean;
}
