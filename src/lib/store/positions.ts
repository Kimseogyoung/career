import "server-only";
import { sanitizeDuties } from "@/lib/positions/duties";
import { ConflictError, GitHubStore } from "./github";
import { POSITIONS_PATH } from "./paths";
import type { Position, PositionMark, PositionRun, PositionsFile } from "./types";

// 추천 포지션 저장(ADR-017). meta/positions.json 한 파일:
//   duties(고른 직무) · marks(⭐·숨김) · postings(수집한 공고 요약) · lastRun(마지막 수집 결과)
// 공고 원문은 저장하지 않는다. 사용자 표시(marks)와 수집 결과가 같은 파일이라 sha 충돌 시 다시 읽어 합친다.

const MAX_RETRY = 3;

export const EMPTY_POSITIONS: PositionsFile = { version: 1, duties: [16], marks: {}, postings: [] };

function parse(text: string | null): PositionsFile {
  if (!text) return structuredClone(EMPTY_POSITIONS);
  try {
    const p = JSON.parse(text) as Partial<PositionsFile>;
    return {
      version: 1,
      duties: Array.isArray(p.duties) ? sanitizeDuties(p.duties) : EMPTY_POSITIONS.duties,
      marks: p.marks && typeof p.marks === "object" ? p.marks : {},
      postings: Array.isArray(p.postings) ? p.postings : [],
      lastRun: p.lastRun,
    };
  } catch {
    return structuredClone(EMPTY_POSITIONS);
  }
}

/** 한 번의 수집 결과. listComplete 가 false 면(목록을 끝까지 못 받음) 사라진 공고를 지우지 않는다. */
export interface RunResult {
  duties: number[];
  listed: Omit<Position, "firstSeen" | "baseline" | "detail">[];
  listComplete: boolean;
  details: Map<number, NonNullable<Position["detail"]>>;
  run: PositionRun;
}

/** 수집 결과를 기존 파일에 합친다(순수 함수 — 테스트 대상). */
export function mergeRun(cur: PositionsFile, r: RunResult): PositionsFile {
  // 수집 도중 직무를 바꿨다면 이 결과는 버린다(다음 수집이 새 직무로 받는다). 실행 기록만 남긴다.
  if (r.duties.join(",") !== cur.duties.join(",")) return { ...cur, lastRun: r.run };
  const byGno = new Map(cur.postings.map((p) => [p.gno, p]));
  const firstEver = cur.postings.length === 0 && !cur.lastRun?.ok;
  const now = r.run.at;
  const next: Position[] = [];
  for (const item of r.listed) {
    const old = byGno.get(item.gno);
    const detail = r.details.get(item.gno) ?? old?.detail;
    next.push({
      ...item,
      firstSeen: old?.firstSeen ?? now,
      baseline: old ? old.baseline : firstEver || undefined,
      detail,
    });
    byGno.delete(item.gno);
  }
  // 목록을 끝까지 받았을 때만 사라진 공고(마감·삭제)를 지운다.
  if (!r.listComplete) next.push(...byGno.values());
  const alive = new Set(next.map((p) => String(p.gno)));
  const marks = Object.fromEntries(Object.entries(cur.marks).filter(([g]) => alive.has(g)));
  return { ...cur, postings: next, marks, lastRun: r.run };
}

export class PositionStore {
  private cache: PositionsFile | null = null;

  constructor(private readonly github: GitHubStore) {}

  async get(): Promise<PositionsFile> {
    if (!this.cache) {
      const file = await this.github.read(POSITIONS_PATH);
      this.cache = parse(file?.text ?? null);
    }
    return this.cache;
  }

  private async mutate(fn: (cur: PositionsFile) => PositionsFile, message: string): Promise<PositionsFile> {
    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      const file = await this.github.read(POSITIONS_PATH);
      const next = fn(parse(file?.text ?? null));
      try {
        await this.github.write(POSITIONS_PATH, JSON.stringify(next, null, 1), file?.sha, message);
        this.cache = next;
        return next;
      } catch (e) {
        // 수집과 ⭐ 표시가 동시에 쓰는 경우 — 다시 읽어 그 위에 적용한다.
        if (e instanceof ConflictError && attempt < MAX_RETRY) continue;
        throw e;
      }
    }
    throw new Error("추천 포지션 저장 재시도 초과");
  }

  /** 직무 변경. 바뀌면 기존 공고는 비운다(다른 직무 공고가 섞이지 않게). */
  async setDuties(codes: unknown): Promise<PositionsFile> {
    const duties = sanitizeDuties(codes);
    if (!duties.length) throw new Error("직무를 하나 이상 고르세요");
    return this.mutate((cur) => {
      if (cur.duties.join(",") === duties.join(",")) return cur;
      return { ...cur, duties, postings: [], marks: {}, lastRun: undefined };
    }, "추천 포지션 직무 변경");
  }

  async setMark(gno: number, mark: PositionMark | null): Promise<boolean> {
    if (!(await this.get()).postings.some((p) => p.gno === gno)) return false;
    await this.mutate((cur) => {
      const marks = { ...cur.marks };
      if (mark) marks[String(gno)] = mark;
      else delete marks[String(gno)];
      return { ...cur, marks };
    }, mark === "hidden" ? "추천 포지션 숨김" : "추천 포지션 관심 표시");
    return true;
  }

  async applyRun(r: RunResult): Promise<PositionsFile> {
    return this.mutate((cur) => mergeRun(cur, r), `추천 포지션 수집 (${r.listed.length}건)`);
  }
}
