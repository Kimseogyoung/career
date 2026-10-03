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

export interface Settings {
  version: 1;
  timezone: string;
  recordingHours: RecordingHours;
  categories: Category[];
  reminder: ReminderSettings;
  pushSubscriptions: PushSubscriptionRecord[];
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
