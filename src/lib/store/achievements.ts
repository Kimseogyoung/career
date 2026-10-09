import "server-only";
import { ConflictError, GitHubStore } from "./github";
import { ACHIEVEMENTS_PATH } from "./paths";
import { ulid } from "./ulid";
import type { Achievement, AchievementsFile } from "./types";

// 성과 모음 저장. 변경이 드물고 쓰기 큐를 거칠 필요가 없어, settings 와 동일하게
// 원격에 직접 쓴다(sha 충돌 시 재시도). career-db 안 meta/achievements.json.

const MAX_RETRY = 3;

function parse(text: string | null): Achievement[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as Partial<AchievementsFile>;
    return Array.isArray(parsed.achievements) ? parsed.achievements : [];
  } catch {
    return [];
  }
}

export interface NewAchievement {
  title: string;
  problem?: string;
  approach?: string;
  result?: string;
  tech?: string[];
  theme?: string;
  sourceDates?: string[];
  createdBy?: Achievement["createdBy"];
}

function build(input: NewAchievement, now: string): Achievement {
  return {
    id: ulid(),
    title: input.title.trim(),
    problem: input.problem?.trim() || undefined,
    approach: input.approach?.trim() || undefined,
    result: input.result?.trim() || undefined,
    tech: (input.tech ?? []).map((t) => t.trim()).filter(Boolean),
    theme: input.theme?.trim() || undefined,
    star: false,
    sourceDates: (input.sourceDates ?? []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    createdBy: input.createdBy ?? "manual",
    createdAt: now,
    updatedAt: now,
  };
}

export class AchievementStore {
  private cache: { data: Achievement[]; sha: string | null } | null = null;

  constructor(private readonly github: GitHubStore) {}

  async list(): Promise<Achievement[]> {
    if (this.cache) return this.cache.data;
    const file = await this.github.read(ACHIEVEMENTS_PATH);
    this.cache = { data: parse(file?.text ?? null), sha: file?.sha ?? null };
    return this.cache.data;
  }

  // 원격을 읽어 변형 후 쓴다. 충돌 시 재시도.
  private async mutate(fn: (list: Achievement[]) => Achievement[]): Promise<Achievement[]> {
    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      const file = await this.github.read(ACHIEVEMENTS_PATH);
      const current = parse(file?.text ?? null);
      const next = fn(current);
      const payload: AchievementsFile = { version: 1, achievements: next };
      try {
        const sha = await this.github.write(
          ACHIEVEMENTS_PATH,
          JSON.stringify(payload, null, 2),
          file?.sha,
          "성과 모음 업데이트",
        );
        this.cache = { data: next, sha };
        return next;
      } catch (e) {
        if (e instanceof ConflictError && attempt < MAX_RETRY) continue;
        throw e;
      }
    }
    throw new Error("성과 저장 재시도 초과");
  }

  /** 후보 여러 건을 성과로 추가(최신이 앞). 담을 게 없으면 원격을 건드리지 않는다. */
  async addMany(items: NewAchievement[]): Promise<Achievement[]> {
    const now = new Date().toISOString();
    const made = items.filter((i) => i.title?.trim()).map((i) => build(i, now));
    if (made.length === 0) return [];
    await this.mutate((list) => [...made, ...list]);
    return made;
  }

  /** 한 건 수정(편집 가능 필드만). 없으면 null(원격 쓰기 없음). */
  async update(id: string, patch: Partial<Achievement>): Promise<Achievement | null> {
    if (!(await this.list()).some((a) => a.id === id)) return null;
    let updated: Achievement | null = null;
    await this.mutate((list) =>
      list.map((a) => {
        if (a.id !== id) return a;
        updated = {
          ...a,
          title: patch.title !== undefined ? patch.title.trim() : a.title,
          problem: patch.problem !== undefined ? patch.problem.trim() || undefined : a.problem,
          approach: patch.approach !== undefined ? patch.approach.trim() || undefined : a.approach,
          result: patch.result !== undefined ? patch.result.trim() || undefined : a.result,
          tech: patch.tech !== undefined ? patch.tech.map((t) => t.trim()).filter(Boolean) : a.tech,
          theme: patch.theme !== undefined ? patch.theme.trim() || undefined : a.theme,
          star: patch.star !== undefined ? patch.star : a.star,
          updatedAt: new Date().toISOString(),
        };
        return updated;
      }),
    );
    return updated;
  }

  async remove(id: string): Promise<void> {
    if (!(await this.list()).some((a) => a.id === id)) return; // 없으면 원격 쓰기 없음
    await this.mutate((list) => list.filter((a) => a.id !== id));
  }
}
