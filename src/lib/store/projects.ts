import "server-only";
import {
  TEXT_HARD_MAX,
  PHOTO_BYTES_MAX,
  PHOTOS_MAX,
} from "@/lib/career-limits";
import { compareRecent, isYearMonth, parseLegacyPeriod } from "@/lib/period";
import { ConflictError, GitHubStore } from "./github";
import { cacheDelete, cacheGet, cacheSet, detectImage, mediaPath } from "./media";
import { PROJECTS_PATH } from "./paths";
import { ulid } from "./ulid";
import type { Project, ProjectEnd, ProjectMark, ProjectPhoto, ProjectsFile } from "./types";

// 프로젝트 저장. 성과 모음과 동일하게 원격(meta/projects.json)에 직접 쓰고 sha 충돌 시 재시도.
// 성과(achievement)는 projectId 로 이 프로젝트를 참조한다. 사진 파일은 meta/media/ (ADR-015).

const MAX_RETRY = 3;
const CURRENT_LIKE = /^(현재|now|present|current)$/i;

/** 경력 항목 id. 존재 여부는 읽는 쪽(resolveCareer)이 판단 — 경력이 지워져도 프로젝트는 그대로. */
function sanitizeCareerId(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 40) : undefined;
}

function clip(v: unknown, max: number): string | undefined {
  return typeof v === "string" ? v.trim().slice(0, max) || undefined : undefined;
}

export function sanitizeMark(v: unknown): ProjectMark | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const date = isYearMonth(o.date) ? o.date : undefined;
  const note = clip(o.note, TEXT_HARD_MAX);
  return date || note ? { date, note } : undefined;
}

export function sanitizeEnd(v: unknown): ProjectEnd | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const note = clip(o.note, TEXT_HARD_MAX);
  if (o.ongoing === true) return { ongoing: true, note };
  const date = isYearMonth(o.date) ? o.date : undefined;
  return date || note ? { date, note } : undefined;
}

/** 예전 자유 글자 period 를 start/end 로 옮긴다. 실패하면 period 를 그대로 둔다. */
export function migrateProject(p: Project): Project {
  if (p.start?.date || !p.period) return p;
  const parsed = parseLegacyPeriod(p.period);
  if (!parsed.start) return p;
  const end: ProjectEnd = parsed.current
    ? { ongoing: true, note: parsed.endNote && !CURRENT_LIKE.test(parsed.endNote) ? parsed.endNote : undefined }
    : { date: parsed.end ?? undefined, note: parsed.endNote };
  const { period: _legacy, ...rest } = p;
  void _legacy;
  const start: ProjectMark = parsed.startNote
    ? { date: parsed.start, note: parsed.startNote }
    : { date: parsed.start };
  return { ...rest, start, end };
}

function parse(text: string | null): Project[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as Partial<ProjectsFile>;
    return Array.isArray(parsed.projects) ? parsed.projects.map(migrateProject) : [];
  } catch {
    return [];
  }
}

/** 최신순: 진행 중 → 종료 늦은 순 → 시작 늦은 순. 날짜가 같으면 order. */
export function sortProjects(list: Project[]): Project[] {
  return [...list].sort(
    (a, b) =>
      compareRecent(
        { start: a.start?.date, end: a.end?.date, current: a.end?.ongoing },
        { start: b.start?.date, end: b.end?.date, current: b.end?.ongoing },
      ) || a.order - b.order,
  );
}

export interface NewProject {
  name: string;
  description?: string;
  start?: ProjectMark;
  end?: ProjectEnd;
  careerId?: string;
}

export interface ProjectPatch {
  name?: string;
  description?: string;
  careerId?: string | null; // null·"" 이면 자동(기간으로 추정)으로 되돌린다
  start?: ProjectMark | null;
  end?: ProjectEnd | null;
  /** 사진 순서·설명만 바꾼다. 목록에 없는 id 는 무시(새 사진은 addPhoto 로만). */
  photos?: { id: string; caption?: string }[];
}

export class PhotoError extends Error {
  constructor(public readonly code: "not_found" | "too_many" | "too_large" | "unsupported") {
    super(code);
  }
}

export class ProjectStore {
  private cache: { data: Project[]; sha: string | null } | null = null;

  constructor(private readonly github: GitHubStore) {}

  async list(): Promise<Project[]> {
    if (this.cache) return sortProjects(this.cache.data);
    const file = await this.github.read(PROJECTS_PATH);
    this.cache = { data: parse(file?.text ?? null), sha: file?.sha ?? null };
    return sortProjects(this.cache.data);
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

  /** 새 프로젝트 추가. 이름이 없으면 원격을 건드리지 않는다. */
  async add(input: NewProject): Promise<Project | null> {
    if (!input.name?.trim()) return null;
    const now = new Date().toISOString();
    let made: Project | null = null;
    await this.mutate((list) => {
      const order = list.reduce((m, p) => Math.max(m, p.order), -1) + 1;
      made = {
        id: ulid(),
        name: input.name.trim(),
        description: clip(input.description, TEXT_HARD_MAX),
        start: sanitizeMark(input.start),
        end: sanitizeEnd(input.end),
        careerId: sanitizeCareerId(input.careerId),
        photos: [],
        order,
        createdAt: now,
        updatedAt: now,
      };
      return [...list, made];
    });
    return made;
  }

  /** 한 건 수정. 없으면 null(원격 쓰기 없음). 날짜를 지정하면 레거시 period 는 지운다. */
  async update(id: string, patch: ProjectPatch): Promise<Project | null> {
    if (!(await this.list()).some((p) => p.id === id)) return null;
    let updated: Project | null = null;
    await this.mutate((list) =>
      list.map((p) => {
        if (p.id !== id) return p;
        const start = patch.start !== undefined ? sanitizeMark(patch.start) : p.start;
        const next: Project = {
          ...p,
          name: typeof patch.name === "string" && patch.name.trim() ? patch.name.trim() : p.name,
          description:
            patch.description !== undefined ? clip(patch.description, TEXT_HARD_MAX) : p.description,
          start,
          end: patch.end !== undefined ? sanitizeEnd(patch.end) : p.end,
          careerId: patch.careerId !== undefined ? sanitizeCareerId(patch.careerId) : p.careerId,
          period: start?.date ? undefined : p.period,
          photos: patch.photos ? reorderPhotos(p.photos ?? [], patch.photos) : p.photos,
          updatedAt: new Date().toISOString(),
        };
        updated = next;
        return next;
      }),
    );
    return updated;
  }

  /** 삭제. 사진 파일도 지운다(실패해도 프로젝트 삭제는 유지 — 남은 파일은 무해). */
  async remove(id: string): Promise<void> {
    const target = (await this.list()).find((p) => p.id === id);
    if (!target) return;
    await this.mutate((list) => list.filter((p) => p.id !== id));
    for (const photo of target.photos ?? []) {
      await this.deleteFile(id, photo);
    }
  }

  /**
   * 사진 추가. 파일을 먼저 올리고 목록에 등록한다. 등록이 실패하면 올린 파일을 지운다.
   * 형식은 바이트 시그니처로 판별(webp·jpg·png).
   */
  async addPhoto(
    projectId: string,
    bytes: Uint8Array,
    meta: { width: number; height: number; caption?: string },
  ): Promise<ProjectPhoto> {
    const project = (await this.list()).find((p) => p.id === projectId);
    if (!project) throw new PhotoError("not_found");
    if ((project.photos ?? []).length >= PHOTOS_MAX) throw new PhotoError("too_many");
    if (bytes.length === 0 || bytes.length > PHOTO_BYTES_MAX) throw new PhotoError("too_large");
    const ext = detectImage(bytes);
    if (!ext) throw new PhotoError("unsupported");

    const photo: ProjectPhoto = {
      id: ulid(),
      ext,
      width: clampDim(meta.width),
      height: clampDim(meta.height),
      bytes: bytes.length,
      caption: clip(meta.caption, TEXT_HARD_MAX),
    };
    const path = mediaPath(projectId, photo);
    await this.github.writeBytes(path, bytes, undefined, "프로젝트 사진 추가");
    try {
      let full = false;
      await this.mutate((list) =>
        list.map((p) => {
          if (p.id !== projectId) return p;
          if ((p.photos ?? []).length >= PHOTOS_MAX) {
            full = true; // 그 사이 다른 곳에서 채워졌다
            return p;
          }
          return { ...p, photos: [...(p.photos ?? []), photo], updatedAt: new Date().toISOString() };
        }),
      );
      if (full) throw new PhotoError("too_many");
    } catch (e) {
      await this.github.remove(path, "프로젝트 사진 추가 취소").catch(() => {});
      throw e;
    }
    cacheSet(path, bytes);
    return photo;
  }

  async removePhoto(projectId: string, photoId: string): Promise<boolean> {
    const project = (await this.list()).find((p) => p.id === projectId);
    const photo = project?.photos?.find((x) => x.id === photoId);
    if (!project || !photo) return false;
    await this.mutate((list) =>
      list.map((p) =>
        p.id === projectId
          ? { ...p, photos: (p.photos ?? []).filter((x) => x.id !== photoId), updatedAt: new Date().toISOString() }
          : p,
      ),
    );
    await this.deleteFile(projectId, photo);
    return true;
  }

  /** 등록된 사진만 읽는다(임의 경로 읽기 방지). 없으면 null. */
  async readPhoto(projectId: string, photoId: string): Promise<{ photo: ProjectPhoto; bytes: Uint8Array } | null> {
    const photo = (await this.list()).find((p) => p.id === projectId)?.photos?.find((x) => x.id === photoId);
    if (!photo) return null;
    const path = mediaPath(projectId, photo);
    const cached = cacheGet(path);
    if (cached) return { photo, bytes: cached };
    const bytes = await this.github.readBytes(path);
    if (!bytes) return null;
    cacheSet(path, bytes);
    return { photo, bytes };
  }

  private async deleteFile(projectId: string, photo: ProjectPhoto): Promise<void> {
    const path = mediaPath(projectId, photo);
    cacheDelete(path);
    await this.github.remove(path, "프로젝트 사진 삭제").catch(() => {});
  }
}

function clampDim(n: number): number {
  return Number.isFinite(n) ? Math.min(10000, Math.max(1, Math.round(n))) : 1;
}

function reorderPhotos(current: ProjectPhoto[], order: { id: string; caption?: string }[]): ProjectPhoto[] {
  const byId = new Map(current.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const out: ProjectPhoto[] = [];
  for (const o of order) {
    const p = byId.get(o.id);
    if (!p || seen.has(o.id)) continue;
    seen.add(o.id);
    out.push({ ...p, caption: o.caption !== undefined ? clip(o.caption, TEXT_HARD_MAX) : p.caption });
  }
  // 순서 목록에서 빠진 사진은 지우지 않고 뒤에 붙인다(삭제는 removePhoto 로만).
  for (const p of current) if (!seen.has(p.id)) out.push(p);
  return out;
}
