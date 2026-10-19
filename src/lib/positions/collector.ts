import "server-only";
import type { Position, PositionTerms } from "@/lib/store/types";
import type { RunResult } from "@/lib/store/positions";
import { todayKst } from "@/lib/time";
import {
  GAMEJOB_ORIGIN,
  parseDetail,
  parseList,
  parseRegistered,
  parseTotal,
  type SectionKind,
} from "./gamejob";
import { buildDict, findTechs, latinTokens } from "./tech-dict";

// 게임잡 수집(ADR-017). 게임잡 서버에 부담을 주지 않는 것이 첫째 규칙이다.
// - 요청은 한 번에 하나, 사이에 최소 간격(기본 1.5초)
// - 한 번 실행에 요청 상한(기본 300)
// - 오류·차단 응답을 받으면 그 실행을 바로 멈춘다(재시도 폭주 없음). 다음 정기 실행에서 이어 받는다.
// - 이미 상세를 받은 공고는 다시 받지 않는다.

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface CollectOptions {
  fetch?: FetchLike;
  intervalMs?: number;
  maxRequests?: number;
  /** 상세를 이미 받은 공고 번호 */
  known?: Set<number>;
  /** 내 기술(사전에 없던 이름도 찾도록) */
  myTechs?: string[];
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const UA = "Mozilla/5.0 (compatible; CareerLog/1.0; personal job alert, 1 req/1.5s)";

class StopError extends Error {}

export async function collectGamejob(duties: number[], opts: CollectOptions = {}): Promise<RunResult> {
  const doFetch = opts.fetch ?? ((u, i) => fetch(u, i));
  const interval = opts.intervalMs ?? 1500;
  const maxRequests = opts.maxRequests ?? 300;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? (() => new Date());
  const known = opts.known ?? new Set<number>();
  const today = todayKst(now());
  const dict = buildDict(opts.myTechs ?? []);

  let requests = 0;
  let last = 0;
  async function get(url: string, init?: RequestInit): Promise<string> {
    if (requests >= maxRequests) throw new StopError("요청 상한 도달");
    const wait = last + interval - Date.now();
    if (requests > 0 && wait > 0) await sleep(wait);
    requests++;
    last = Date.now();
    let res: Response;
    try {
      res = await doFetch(url, {
        ...init,
        headers: { "User-Agent": UA, "X-Requested-With": "XMLHttpRequest", ...(init?.headers ?? {}) },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      throw new StopError(`네트워크 오류: ${(e as Error).message}`);
    }
    if (!res.ok) throw new StopError(`응답 ${res.status}`);
    return res.text();
  }

  const listed: RunResult["listed"] = [];
  const details: RunResult["details"] = new Map();
  let listComplete = false;
  let error: string | undefined;

  try {
    // 1) 목록: 고른 직무를 쉼표로 묶어 한 번에, 100건씩.
    const seen = new Set<number>();
    for (let page = 1; page <= MAX_PAGES; page++) {
      const body = new URLSearchParams({
        page: String(page),
        pagesize: String(PAGE_SIZE),
        tabcode: "1",
        order: "1",
        "condition[menucode]": "duty",
        "condition[duty]": duties.join(","),
      });
      const html = await get(`${GAMEJOB_ORIGIN}/Recruit/_GI_Job_List/`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body: body.toString(),
      });
      const items = parseList(html);
      let added = 0;
      for (const it of items) {
        if (seen.has(it.gno)) continue;
        seen.add(it.gno);
        added++;
        listed.push({ ...it, registered: parseRegistered(it.registered, today) });
      }
      const total = parseTotal(html);
      if (!items.length || added === 0 || (total !== null && seen.size >= total) || items.length < PAGE_SIZE) {
        listComplete = true;
        break;
      }
    }

    // 2) 상세: 처음 보는 공고만, 등록 최신순으로.
    const todo = listed
      .filter((p) => !known.has(p.gno))
      .sort((a, b) => (b.registered ?? "").localeCompare(a.registered ?? ""));
    for (const p of todo) {
      const html = await get(`${GAMEJOB_ORIGIN}/Recruit/GI_Read_Comt_Ifrm?gno=${p.gno}`);
      details.set(p.gno, toDetail(parseDetail(html), dict, now().toISOString()));
    }
  } catch (e) {
    if (!(e instanceof StopError)) throw e;
    error = e.message;
  }

  return {
    duties,
    listed,
    listComplete,
    details,
    run: { at: now().toISOString(), ok: !error, listed: listed.length, fetched: details.size, error },
  };
}

/** 구역 글 → 기술 표기(사전 이름 + 영문 토큰). 원문은 버린다. */
export function toDetail(
  d: ReturnType<typeof parseDetail>,
  dict: ReturnType<typeof buildDict>,
  at: string,
): NonNullable<Position["detail"]> {
  const terms = {} as PositionTerms;
  for (const k of ["duty", "req", "pref", "etc"] as SectionKind[]) {
    const t = d.sections[k];
    const set = new Map<string, string>();
    for (const x of [...findTechs(dict, t), ...latinTokens(t)]) {
      const key = x.toLowerCase();
      if (!set.has(key)) set.set(key, x);
    }
    terms[k] = [...set.values()].slice(0, 60);
  }
  return { fetchedAt: at, imageOnly: d.imageOnly, terms, summary: d.summary };
}
