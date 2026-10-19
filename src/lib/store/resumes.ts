import "server-only";
import type { PortfolioDoc } from "@/lib/export/portfolio";
import { ConflictError, GitHubStore } from "./github";
import { RESUMES_INDEX_PATH } from "./paths";
import { ulid } from "./ulid";
import type { ResumeKind, ResumeMeta } from "./types";

// 내보내기 저장본(ROADMAP 3-2, ADR-016). 마음에 든 조립 결과를 그 순간 그대로 얼려 둔다 —
// 원본 성과·프로젝트가 나중에 바뀌어도 저장본은 바뀌지 않는다. 사진만은 파일을 복사하지 않고
// 프로젝트 사진을 가리킨다(원본 사진을 지우면 저장본에서도 빠진다).
//
// 쓰기 순서가 곧 일관성 규칙이다: "목록에 있으면 본문이 있다"를 지킨다.
// - 저장: 본문 파일 → 목록. 목록 쓰기가 실패하면 본문을 지운다(남아도 목록에 없으니 안 보임).
// - 삭제: 목록 → 본문. 본문 삭제가 실패해도 목록에서 빠졌으니 안 보인다.

const MAX_RETRY = 3;
const ID_RE = /^[0-9A-Za-z]{10,40}$/;
export const RESUME_NAME_MAX = 60;
/** GitHub contents API 는 1MB 넘는 파일의 내용을 주지 않는다. 여유를 두고 막는다. */
const BODY_BYTES_MAX = 900 * 1024;
const BODY_CACHE_MAX = 10;

export interface ResumeFile {
  version: 1;
  meta: ResumeMeta;
  /** 근거 성과 id(조립에 들어간 순서). 3-3 근거 역추적용. */
  sourceIds: string[];
  doc: PortfolioDoc;
}

interface ResumesIndex {
  version: 1;
  resumes: ResumeMeta[];
}

export class ResumeError extends Error {
  constructor(public readonly code: "too_large") {
    super(code);
  }
}

export function resumePath(id: string): string {
  if (!ID_RE.test(id)) throw new Error("잘못된 저장본 id");
  return `meta/resumes/${id}.json`;
}

function parseIndex(text: string | null): ResumeMeta[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as Partial<ResumesIndex>;
    return Array.isArray(parsed.resumes) ? parsed.resumes : [];
  } catch {
    return [];
  }
}

function newestFirst(list: ResumeMeta[]): ResumeMeta[] {
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 조립 결과에 들어간 성과 id. 프로젝트 순서 → 기타 순. */
export function sourceIdsOf(doc: PortfolioDoc): string[] {
  return [...doc.projects.flatMap((p) => p.achievements.map((a) => a.id)), ...doc.loose.map((a) => a.id)];
}

export function cleanResumeName(v: unknown, fallback: string): string {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, RESUME_NAME_MAX) : "";
  return s || fallback;
}

export class ResumeStore {
  private index: ResumeMeta[] | null = null;
  private bodies = new Map<string, ResumeFile>();

  constructor(private readonly github: GitHubStore) {}

  /** 저장본 목록(최신순). */
  async list(): Promise<ResumeMeta[]> {
    if (!this.index) {
      const file = await this.github.read(RESUMES_INDEX_PATH);
      this.index = parseIndex(file?.text ?? null);
    }
    return newestFirst(this.index);
  }

  /** 한 건. 목록에 없거나 id 가 이상하면 null. */
  async get(id: string): Promise<ResumeFile | null> {
    if (!ID_RE.test(id)) return null;
    if (!(await this.list()).some((m) => m.id === id)) return null;
    const cached = this.bodies.get(id);
    if (cached) return cached;
    const file = await this.github.read(resumePath(id));
    if (!file) return null;
    let body: ResumeFile;
    try {
      body = JSON.parse(file.text) as ResumeFile;
    } catch {
      return null;
    }
    if (!body?.doc || !body.meta) return null;
    this.remember(id, body);
    return body;
  }

  /** 조립 결과를 얼려 저장한다. */
  async save(input: {
    name: string;
    kind: ResumeKind;
    options: ResumeMeta["options"];
    doc: PortfolioDoc;
  }): Promise<ResumeMeta> {
    const meta: ResumeMeta = {
      id: ulid(),
      name: cleanResumeName(input.name, "저장본"),
      kind: input.kind,
      options: { starOnly: input.options.starOnly, photos: input.options.photos },
      counts: input.doc.counts,
      createdAt: new Date().toISOString(),
    };
    const body: ResumeFile = { version: 1, meta, sourceIds: sourceIdsOf(input.doc), doc: input.doc };
    const text = JSON.stringify(body, null, 2);
    if (Buffer.byteLength(text, "utf8") > BODY_BYTES_MAX) throw new ResumeError("too_large");

    const path = resumePath(meta.id);
    await this.github.write(path, text, undefined, `내보내기 저장본 추가: ${meta.name}`);
    try {
      await this.mutateIndex((list) => [...list, meta], "내보내기 저장본 목록 갱신");
    } catch (e) {
      await this.github.remove(path, "내보내기 저장본 추가 취소").catch(() => {});
      throw e;
    }
    // 넘겨받은 객체가 아니라 직렬화한 사본을 캐시한다 — 호출자가 나중에 고쳐도 저장본은 그대로.
    this.remember(meta.id, JSON.parse(text) as ResumeFile);
    return meta;
  }

  /** 삭제. 목록에 없으면 false(원격 쓰기 없음). */
  async remove(id: string): Promise<boolean> {
    if (!ID_RE.test(id) || !(await this.list()).some((m) => m.id === id)) return false;
    await this.mutateIndex((list) => list.filter((m) => m.id !== id), "내보내기 저장본 삭제");
    this.bodies.delete(id);
    await this.github.remove(resumePath(id), "내보내기 저장본 삭제").catch(() => {});
    return true;
  }

  private async mutateIndex(fn: (list: ResumeMeta[]) => ResumeMeta[], message: string): Promise<void> {
    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      const file = await this.github.read(RESUMES_INDEX_PATH);
      const next = fn(parseIndex(file?.text ?? null));
      const payload: ResumesIndex = { version: 1, resumes: newestFirst(next) };
      try {
        await this.github.write(RESUMES_INDEX_PATH, JSON.stringify(payload, null, 2), file?.sha, message);
        this.index = next;
        return;
      } catch (e) {
        // 다른 탭에서 동시에 저장·삭제했다 — 다시 읽어 그 위에 적용한다.
        if (e instanceof ConflictError && attempt < MAX_RETRY) continue;
        throw e;
      }
    }
    throw new Error("저장본 목록 저장 재시도 초과");
  }

  private remember(id: string, body: ResumeFile): void {
    this.bodies.set(id, body);
    for (const k of this.bodies.keys()) {
      if (this.bodies.size <= BODY_CACHE_MAX) break;
      this.bodies.delete(k);
    }
  }
}
