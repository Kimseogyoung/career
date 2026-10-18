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
  star: boolean; // ⭐ 공개 Showcase 홈의 대표 성과로 노출
  hidden?: boolean; // true면 공개 Showcase에서 제외(기본값: 공개)
  projectId?: string; // 연결된 프로젝트(Project.id). 미지정 가능
  sourceDates: string[]; // 근거 날짜 "YYYY-MM-DD"
  createdBy: GeneratedBy; // ai | manual
  createdAt: string;
  updatedAt: string;
}

export interface AchievementsFile {
  version: 1;
  achievements: Achievement[];
}

// ── 커리어: 프로젝트 (meta/projects.json) ──────────────────────────

/** 프로젝트 시작·종료 시점. 날짜는 월 단위 "YYYY-MM", 코멘트는 "합류"·"출시" 같은 짧은 말. */
export interface ProjectMark {
  date?: string; // "YYYY-MM"
  note?: string;
}

export interface ProjectEnd extends ProjectMark {
  ongoing?: boolean; // 진행 중이면 date 없음(코멘트 기본 "개발 중")
}

/** 프로젝트 사진. 파일은 career-db `meta/media/<projectId>/<id>.<ext>` (ADR-015). */
export interface ProjectPhoto {
  id: string; // ULID — 파일명. 내용이 바뀌면 새 id(캐시 불변)
  ext: "webp" | "jpg" | "png";
  width: number;
  height: number;
  bytes: number;
  caption?: string; // 대체 텍스트
}

export interface Project {
  id: string; // ULID
  name: string;
  start?: ProjectMark;
  end?: ProjectEnd;
  period?: string; // 레거시 자유 문자열 — 날짜로 옮기지 못한 경우에만 남는다
  careerId?: string; // 소속 회사(경력 항목 id). 없으면 기간으로 추정 — lib/career-link.ts
  description?: string;
  photos?: ProjectPhoto[]; // 최대 10장, 첫 장이 대표
  order: number; // 같은 날짜일 때의 보조 순서
  createdAt: string;
  updatedAt: string;
}

export interface ProjectsFile {
  version: 1;
  projects: Project[];
}

// ── 커리어: 내 정보 (meta/profile.json) ────────────────────────────

export interface TechStackGroup {
  label: string;
  items: string[];
}

export interface CareerEntry {
  id: string;
  org?: string; // 회사/소속
  role?: string; // 역할
  start?: string; // "YYYY-MM"
  end?: string; // "YYYY-MM" (재직 중이면 없음)
  current?: boolean; // 재직 중
  period?: string; // 레거시 자유 문자열 — 날짜로 옮기지 못한 경우에만 남는다
  note?: string; // 여러 줄, 최대 CAREER_NOTE_MAX 자
}

export interface ProfileLink {
  label: string; // 비면 호스트명
  url: string; // http(s) 만
}

/** 공개 Showcase 홈을 채우는 내 정보. */
export interface Profile {
  name?: string; // 이름(Showcase 제목·공유 미리보기)
  headline?: string; // 직함 한 줄(예: 게임 서버 개발자)
  email?: string; // 연락 이메일(공개 화면엔 "복사" 버튼으로만)
  links?: ProfileLink[]; // GitHub·블로그 등, 최대 LINKS_MAX
  intro?: string; // 한마디(2줄 소개)
  techStack: TechStackGroup[];
  career: CareerEntry[];
}

export interface ProfileFile {
  version: 1;
  profile: Profile;
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
