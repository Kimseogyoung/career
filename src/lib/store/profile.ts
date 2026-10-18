import "server-only";
import { TEXT_HARD_MAX } from "@/lib/career-limits";
import { compareRecent, isYearMonth, parseLegacyPeriod } from "@/lib/period";
import { ConflictError, GitHubStore } from "./github";
import { PROFILE_PATH } from "./paths";
import { ulid } from "./ulid";
import type { CareerEntry, Profile, ProfileFile, TechStackGroup } from "./types";

// 내 정보(이름·직함·한마디·기술 스택·경력) 저장. settings 와 동일하게 원격(meta/profile.json)에
// 직접 쓴다(sha 충돌 시 재시도). 공개 Showcase 홈을 이 데이터로 채운다.
// 경력 기간은 "YYYY-MM" 시작/종료(또는 재직 중). 예전 자유 글자 period 는 읽을 때 옮긴다.

export const DEFAULT_PROFILE: Profile = { intro: undefined, techStack: [], career: [] };

function clip(v: unknown, max: number): string | undefined {
  return typeof v === "string" ? v.trim().slice(0, max) || undefined : undefined;
}

/** 최신순: 재직 중 → 종료 늦은 순 → 시작 늦은 순. 날짜 없는(옮기지 못한) 항목은 아래. */
export function sortCareer(list: CareerEntry[]): CareerEntry[] {
  return [...list].sort(compareRecent);
}

const MAX_RETRY = 3;

function sanitizeTechStack(v: unknown): TechStackGroup[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((g) => {
      const o = (g ?? {}) as Record<string, unknown>;
      const label = typeof o.label === "string" ? o.label.trim() : "";
      const items = Array.isArray(o.items)
        ? o.items.filter((i): i is string => typeof i === "string").map((i) => i.trim()).filter(Boolean)
        : [];
      return { label, items };
    })
    .filter((g) => g.label || g.items.length);
}

export function sanitizeCareer(v: unknown): CareerEntry[] {
  if (!Array.isArray(v)) return [];
  const list = v
    .map((e): CareerEntry => {
      const o = (e ?? {}) as Record<string, unknown>;
      let start = isYearMonth(o.start) ? o.start : undefined;
      let end = isYearMonth(o.end) ? o.end : undefined;
      let current = o.current === true;
      let period = clip(o.period, TEXT_HARD_MAX);
      // 예전 자유 글자 기간 → 구조화. 옮기면 원문은 버리고, 못 옮기면 남겨 화면에서 수정 유도.
      if (!start && period) {
        const parsed = parseLegacyPeriod(period);
        if (parsed.start) {
          start = parsed.start;
          end = parsed.end ?? undefined;
          current = parsed.current;
          period = undefined;
        }
      }
      if (start) period = undefined;
      if (current) end = undefined;
      return {
        id: typeof o.id === "string" && o.id ? o.id.slice(0, 40) : ulid(),
        org: clip(o.org, TEXT_HARD_MAX),
        role: clip(o.role, TEXT_HARD_MAX),
        start,
        end,
        current: current || undefined,
        period,
        note: clip(o.note, TEXT_HARD_MAX),
      };
    })
    .filter((e) => e.org || e.role || e.start || e.period || e.note);
  return sortCareer(list);
}

function parse(text: string | null): Profile {
  if (!text) return DEFAULT_PROFILE;
  try {
    const parsed = JSON.parse(text) as Partial<ProfileFile> & { profile?: unknown };
    const p = (parsed.profile ?? {}) as Record<string, unknown>;
    return {
      name: clip(p.name, TEXT_HARD_MAX),
      headline: clip(p.headline, TEXT_HARD_MAX),
      intro: clip(p.intro, TEXT_HARD_MAX),
      techStack: sanitizeTechStack(p.techStack),
      career: sanitizeCareer(p.career),
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export class ProfileStore {
  private cache: { data: Profile; sha: string | null } | null = null;

  constructor(private readonly github: GitHubStore) {}

  async get(): Promise<Profile> {
    if (this.cache) return this.cache.data;
    const file = await this.github.read(PROFILE_PATH);
    this.cache = { data: parse(file?.text ?? null), sha: file?.sha ?? null };
    return this.cache.data;
  }

  /** 전체 교체(병합 아님). 원격을 읽어 sha 로 쓴다. 충돌 시 재시도. */
  async put(input: Partial<Profile>): Promise<Profile> {
    const next: Profile = {
      name: clip(input.name, TEXT_HARD_MAX),
      headline: clip(input.headline, TEXT_HARD_MAX),
      intro: clip(input.intro, TEXT_HARD_MAX),
      techStack: sanitizeTechStack(input.techStack),
      career: sanitizeCareer(input.career),
    };
    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      const file = await this.github.read(PROFILE_PATH);
      const payload: ProfileFile = { version: 1, profile: next };
      try {
        const sha = await this.github.write(
          PROFILE_PATH,
          JSON.stringify(payload, null, 2),
          file?.sha,
          "내 정보 업데이트",
        );
        this.cache = { data: next, sha };
        return next;
      } catch (e) {
        if (e instanceof ConflictError && attempt < MAX_RETRY) continue;
        throw e;
      }
    }
    throw new Error("내 정보 저장 재시도 초과");
  }
}
