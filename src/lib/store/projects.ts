import "server-only";
import { ConflictError, GitHubStore } from "./github";
import { PROJECTS_PATH } from "./paths";
import { ulid } from "./ulid";
import type { Project, ProjectsFile } from "./types";

// 프로젝트 저장. 성과 모음과 동일하게 원격(meta/projects.json)에 직접 쓰고 sha 충돌 시 재시도.
// 성과(achievement)는 projectId 로 이 프로젝트를 참조한다.

const MAX_RETRY = 3;

function parse(text: string | null): Project[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as Partial<ProjectsFile>;
    return Array.isArray(parsed.projects) ? parsed.projects : [];
  } catch {
    return [];
  }
}

function sorted(list: Project[]): Project[] {
  return [...list].sort((a, b) => a.order - b.order);
}

export interface NewProject {
  name: string;
  period?: string;
  description?: string;
}

export class ProjectStore {
  private cache: { data: Project[]; sha: string | null } | null = null;

  constructor(private readonly github: GitHubStore) {}

  async list(): Promise<Project[]> {
    if (this.cache) return sorted(this.cache.data);
    const file = await this.github.read(PROJECTS_PATH);
    this.cache = { data: parse(file?.text ?? null), sha: file?.sha ?? null };
    return sorted(this.cache.data);
  }

  private async mutate(fn: (list: Project[]) => Project[]): Promise<Project[]> {
    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      const file = await this.github.read(PROJECTS_PATH);
      const current = parse(file?.text ?? null);
      const next = fn(current);
      const payload: ProjectsFile = { version: 1, projects: next };
      try {
        const sha = await this.github.write(
          PROJECTS_PATH,
          JSON.stringify(payload, null, 2),
          file?.sha,
          "프로젝트 업데이트",
        );
        this.cache = { data: next, sha };
        return next;
      } catch (e) {
        if (e instanceof ConflictError && attempt < MAX_RETRY) continue;
        throw e;
      }
    }
    throw new Error("프로젝트 저장 재시도 초과");
  }

  /** 새 프로젝트 추가(맨 뒤 순서). 이름이 없으면 원격을 건드리지 않는다. */
  async add(input: NewProject): Promise<Project | null> {
    if (!input.name?.trim()) return null;
    const now = new Date().toISOString();
    let made: Project | null = null;
    await this.mutate((list) => {
      const order = list.reduce((m, p) => Math.max(m, p.order), -1) + 1;
      made = {
        id: ulid(),
        name: input.name.trim(),
        period: input.period?.trim() || undefined,
        description: input.description?.trim() || undefined,
        order,
        createdAt: now,
        updatedAt: now,
      };
      return [...list, made];
    });
    return made;
  }

  /** 한 건 수정. 없으면 null(원격 쓰기 없음). */
  async update(id: string, patch: Partial<Project>): Promise<Project | null> {
    if (!(await this.list()).some((p) => p.id === id)) return null;
    let updated: Project | null = null;
    await this.mutate((list) =>
      list.map((p) => {
        if (p.id !== id) return p;
        updated = {
          ...p,
          name: patch.name !== undefined ? patch.name.trim() || p.name : p.name,
          period: patch.period !== undefined ? patch.period.trim() || undefined : p.period,
          description:
            patch.description !== undefined ? patch.description.trim() || undefined : p.description,
          order: patch.order !== undefined ? patch.order : p.order,
          updatedAt: new Date().toISOString(),
        };
        return updated;
      }),
    );
    return updated;
  }

  async remove(id: string): Promise<void> {
    if (!(await this.list()).some((p) => p.id === id)) return;
    await this.mutate((list) => list.filter((p) => p.id !== id));
  }
}
