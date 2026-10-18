// 프로젝트 → 소속 회사(경력 항목) 연결. 서버·클라이언트 공용 순수 함수.
// 직접 고르지 않았으면 기간이 가장 많이 겹치는 경력으로 본다 — 경력기술서·포트폴리오가 회사 단위로 묶일 때 쓴다.

import type { CareerEntry, Project } from "@/lib/store/types";
import { monthsInclusive, type YearMonth } from "./period";

type ProjectRange = Pick<Project, "start" | "end">;

/** 프로젝트 기간. 진행 중이면 이번 달까지, 종료가 없으면 시작 월 한 달. 시작이 없으면 null. */
function projectRange(p: ProjectRange, now: YearMonth): { start: YearMonth; end: YearMonth } | null {
  const start = p.start?.date;
  if (!start) return null;
  const end = p.end?.ongoing ? now : (p.end?.date ?? start);
  return { start, end: end < start ? start : end };
}

/** 기간이 가장 많이 겹치는 경력. 겹침이 없으면 undefined. 같으면 목록 앞(최신) 우선. */
export function suggestCareer(p: ProjectRange, career: CareerEntry[], now: YearMonth): CareerEntry | undefined {
  const r = projectRange(p, now);
  if (!r) return undefined;
  let best: CareerEntry | undefined;
  let bestMonths = 0;
  for (const c of career) {
    if (!c.start) continue;
    const cEnd = c.current ? now : c.end;
    if (!cEnd) continue;
    const from = r.start > c.start ? r.start : c.start;
    const to = r.end < cEnd ? r.end : cEnd;
    const months = monthsInclusive(from, to);
    if (months > bestMonths) {
      best = c;
      bestMonths = months;
    }
  }
  return best;
}

/** 직접 고른 회사가 있으면 그것(지워진 경력이면 무시), 없으면 기간으로 제안. */
export function resolveCareer(
  p: ProjectRange & Pick<Project, "careerId">,
  career: CareerEntry[],
  now: YearMonth,
): { entry: CareerEntry; auto: boolean } | undefined {
  const picked = p.careerId ? career.find((c) => c.id === p.careerId) : undefined;
  if (picked) return { entry: picked, auto: false };
  const s = suggestCareer(p, career, now);
  return s ? { entry: s, auto: true } : undefined;
}
