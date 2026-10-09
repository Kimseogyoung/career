import "server-only";
import { ConflictError, GitHubStore } from "./github";
import { SETTINGS_PATH } from "./paths";
import type {
  AchievementPrompts,
  PushSubscriptionRecord,
  Settings,
  SummaryPrompts,
} from "./types";

// 설정 저장. 저널(1-1)과 달리 변경이 드물고 유실돼도 치명적이지 않아,
// 쓰기 큐를 거치지 않고 원격에 직접 쓴다(sha 충돌 시 재시도). 미설정/오프라인이면 기본값.

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  timezone: "Asia/Seoul",
  recordingHours: { start: "09:00", end: "18:00" },
  categories: [
    { id: "work", label: "업무", color: "#2563eb" },
    { id: "study", label: "공부", color: "#16a34a" },
    { id: "meeting", label: "회의", color: "#d97706" },
    { id: "side", label: "사이드", color: "#9333ea" },
    { id: "etc", label: "기타", color: "#64748b" },
  ],
  reminder: {
    enabled: true,
    days: [1, 2, 3, 4, 5], // 평일
    hours: { start: "09:00", end: "18:00" },
    skipIfRecorded: true,
  },
  pushSubscriptions: [],
};

/** summaryPrompts 는 system/day/week/month 의 문자열만 추린다. 없으면 undefined. */
function sanitizePrompts(v: unknown): SummaryPrompts | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const out: SummaryPrompts = {};
  for (const k of ["system", "day", "week", "month"] as const) {
    if (typeof o[k] === "string") out[k] = o[k] as string;
  }
  return Object.keys(out).length ? out : undefined;
}

function sanitizeAchievementPrompts(v: unknown): AchievementPrompts | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const out: AchievementPrompts = {};
  for (const k of ["system", "guide"] as const) {
    if (typeof o[k] === "string") out[k] = o[k] as string;
  }
  return Object.keys(out).length ? out : undefined;
}

function parse(text: string | null): Settings {
  if (!text) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(text) as Partial<Settings>;
    return {
      version: 1,
      timezone: parsed.timezone ?? DEFAULT_SETTINGS.timezone,
      recordingHours: parsed.recordingHours ?? DEFAULT_SETTINGS.recordingHours,
      categories:
        Array.isArray(parsed.categories) && parsed.categories.length > 0
          ? parsed.categories
          : DEFAULT_SETTINGS.categories,
      reminder: parsed.reminder ?? DEFAULT_SETTINGS.reminder,
      pushSubscriptions: Array.isArray(parsed.pushSubscriptions) ? parsed.pushSubscriptions : [],
      summaryPrompts: sanitizePrompts(parsed.summaryPrompts),
      achievementPrompts: sanitizeAchievementPrompts(parsed.achievementPrompts),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const MAX_RETRY = 3;

export class SettingsStore {
  private cache: { data: Settings; sha: string | null } | null = null;

  constructor(private readonly github: GitHubStore) {}

  async get(): Promise<Settings> {
    if (this.cache) return this.cache.data;
    const file = await this.github.read(SETTINGS_PATH);
    this.cache = { data: parse(file?.text ?? null), sha: file?.sha ?? null };
    return this.cache.data;
  }

  /** 부분 갱신. 원격을 읽어 병합 후 쓴다. 충돌 시 재시도. */
  async update(patch: Partial<Settings>): Promise<Settings> {
    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      const file = await this.github.read(SETTINGS_PATH);
      const current = parse(file?.text ?? null);
      const next: Settings = { ...current, ...patch, version: 1 };
      try {
        const sha = await this.github.write(
          SETTINGS_PATH,
          JSON.stringify(next, null, 2),
          file?.sha,
          "settings 업데이트",
        );
        this.cache = { data: next, sha };
        return next;
      } catch (e) {
        if (e instanceof ConflictError && attempt < MAX_RETRY) continue;
        throw e;
      }
    }
    throw new Error("설정 저장 재시도 초과");
  }

  /** 푸시 구독 추가(같은 endpoint 는 교체). */
  async addSubscription(sub: PushSubscriptionRecord): Promise<void> {
    const current = await this.get();
    const kept = current.pushSubscriptions.filter((s) => s.endpoint !== sub.endpoint);
    await this.update({ pushSubscriptions: [...kept, sub] });
  }

  /** 푸시 구독 제거(endpoint 기준). */
  async removeSubscription(endpoint: string): Promise<void> {
    const current = await this.get();
    await this.update({
      pushSubscriptions: current.pushSubscriptions.filter((s) => s.endpoint !== endpoint),
    });
  }
}
