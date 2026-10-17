import "server-only";
import { ConflictError, GitHubStore } from "./github";
import { PROFILE_PATH } from "./paths";
import { ulid } from "./ulid";
import type { CareerEntry, Profile, ProfileFile, TechStackGroup } from "./types";

// 내 정보(2줄 소개·기술 스택·경력) 저장. settings 와 동일하게 원격(meta/profile.json)에
// 직접 쓴다(sha 충돌 시 재시도). 공개 Showcase 홈을 이 데이터로 채운다.

export const DEFAULT_PROFILE: Profile = { intro: undefined, techStack: [], career: [] };

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

function sanitizeCareer(v: unknown): CareerEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((e) => {
      const o = (e ?? {}) as Record<string, unknown>;
      const pick = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() || undefined : undefined);
      return {
        id: typeof o.id === "string" && o.id ? o.id : ulid(),
        org: pick("org"),
        role: pick("role"),
        period: pick("period"),
        note: pick("note"),
      };
    })
    .filter((e) => e.org || e.role || e.period || e.note);
}

function parse(text: string | null): Profile {
  if (!text) return DEFAULT_PROFILE;
  try {
    const parsed = JSON.parse(text) as Partial<ProfileFile> & { profile?: unknown };
    const p = (parsed.profile ?? {}) as Record<string, unknown>;
    return {
      intro: typeof p.intro === "string" ? p.intro.trim() || undefined : undefined,
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
      intro: typeof input.intro === "string" ? input.intro.trim() || undefined : undefined,
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
