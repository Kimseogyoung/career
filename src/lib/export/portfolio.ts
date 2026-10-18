import "server-only";
// 포트폴리오 조립(ROADMAP 3-1, ADR-016). AI 없이 결정적으로 만든다 — 요약 API 가 죽어도 나온다.
// 구성: 머리(내 정보) → 경력 목록(성과 없음) → 프로젝트(최신순, 회사는 표시만) + 성과 → 기타 성과.
// 회사별 묶음은 경력기술서 몫이다. 서버·테스트 공용 순수 함수.

import { resolveCareer } from "@/lib/career-link";
import { formatDuration, formatYearMonth, monthsInclusive, type YearMonth } from "@/lib/period";
import { projectPeriodText } from "@/lib/project-period";
import type { Achievement, CareerEntry, Profile, Project, ProjectPhoto } from "@/lib/store/types";
import { sortProjects } from "@/lib/store/projects";

export interface PortfolioOptions {
  /** ⭐ 성과만. 이때 ⭐ 성과가 하나도 없는 프로젝트는 뺀다. */
  starOnly?: boolean;
  /** 사진 포함(기본 true). */
  photos?: boolean;
}

export interface PortfolioProject {
  id: string;
  name: string;
  /** 소속 회사명(직접 고른 것 또는 기간으로 추정). */
  org?: string;
  period?: string;
  description?: string;
  photos: Pick<ProjectPhoto, "id" | "caption" | "width" | "height">[];
  achievements: Achievement[];
}

export interface PortfolioCareer {
  id: string;
  org?: string;
  role?: string;
  period?: string;
  note?: string;
}

export interface PortfolioDoc {
  profile: Pick<Profile, "name" | "headline" | "email" | "links" | "intro" | "techStack">;
  career: PortfolioCareer[];
  projects: PortfolioProject[];
  /** 프로젝트에 묶이지 않은 성과. */
  loose: Achievement[];
  counts: { projects: number; achievements: number };
}

/** 근거 날짜 중 가장 최근(없으면 생성일) — 최신순 정렬 키. */
function recentKey(a: Achievement): string {
  const latest = (a.sourceDates ?? []).reduce((m, d) => (d > m ? d : m), "");
  return latest || (a.createdAt ?? "").slice(0, 10);
}

function careerPeriod(c: CareerEntry, now: YearMonth): string | undefined {
  if (!c.start) return c.period;
  const until = c.current ? now : c.end;
  const range = `${formatYearMonth(c.start)} – ${c.current ? "현재" : c.end ? formatYearMonth(c.end) : ""}`;
  return until ? `${range} (${formatDuration(monthsInclusive(c.start, until))})` : range;
}

export function buildPortfolio(
  achievements: Achievement[],
  projects: Project[],
  profile: Profile,
  now: YearMonth,
  opts: PortfolioOptions = {},
): PortfolioDoc {
  const withPhotos = opts.photos !== false;
  const visible = achievements
    .filter((a) => !a.hidden && (!opts.starOnly || a.star))
    .sort((x, y) => recentKey(y).localeCompare(recentKey(x)));

  const byProject = new Map<string, Achievement[]>();
  const projectIds = new Set(projects.map((p) => p.id));
  const loose: Achievement[] = [];
  for (const a of visible) {
    if (a.projectId && projectIds.has(a.projectId)) {
      const list = byProject.get(a.projectId) ?? [];
      list.push(a);
      byProject.set(a.projectId, list);
    } else loose.push(a);
  }

  const out: PortfolioProject[] = [];
  for (const p of sortProjects(projects)) {
    const items = byProject.get(p.id) ?? [];
    if (opts.starOnly && !items.length) continue;
    const entry: PortfolioProject = {
      id: p.id,
      name: p.name,
      org: resolveCareer(p, profile.career, now)?.entry.org,
      period: projectPeriodText(p),
      description: p.description,
      photos: withPhotos
        ? (p.photos ?? []).map((ph) => ({ id: ph.id, caption: ph.caption, width: ph.width, height: ph.height }))
        : [],
      achievements: items,
    };
    out.push(entry);
  }

  return {
    profile: {
      name: profile.name,
      headline: profile.headline,
      email: profile.email,
      links: profile.links,
      intro: profile.intro,
      techStack: profile.techStack,
    },
    career: profile.career.map((c) => ({
      id: c.id,
      org: c.org,
      role: c.role,
      period: careerPeriod(c, now),
      note: c.note,
    })),
    projects: out,
    loose,
    counts: { projects: out.length, achievements: visible.length },
  };
}
