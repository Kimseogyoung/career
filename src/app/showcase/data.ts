import "server-only";
import { currentYearMonth, formatDuration, formatYearMonth, monthsInclusive, totalMonths } from "@/lib/period";
import {
  getAchievementStore,
  getProfileStore,
  getProjectStore,
  isStoreConfigured,
} from "@/lib/store/instance";
import { DEFAULT_PROFILE } from "@/lib/store/profile";
import { sortProjects } from "@/lib/store/projects";
import type { Achievement, CareerEntry, Profile, Project } from "@/lib/store/types";
import { todayKst } from "@/lib/time";
import type {
  PublicAchievement,
  PublicCareer,
  PublicProfile,
  PublicProject,
} from "./types";

// 공개 Showcase가 노출하는 데이터만 모은다. 기록(journal)·요약·설정·비밀값은 절대 읽지 않는다.
// 성과는 hidden 을 제외하고 전부 공개(기본 공개). 저장 타입은 공개 DTO 로 바꿔 내보낸다. ADR-013.

export interface ShowcaseData {
  profile: PublicProfile;
  projects: PublicProject[]; // 최신순
  achievements: PublicAchievement[]; // hidden 제외, 근거 날짜 최신순
}

/** 정렬 키: 근거 날짜 중 가장 최근. 근거가 없으면 생성일(YYYY-MM-DD)로 대신한다. */
export function sortKey(a: Pick<Achievement, "sourceDates" | "createdAt">): string {
  const latest = (a.sourceDates ?? []).reduce((m, d) => (d > m ? d : m), "");
  return latest || (a.createdAt ?? "").slice(0, 10);
}

/** 근거 날짜에서 연도 라벨(예: "2023–2026" 또는 "2026"). 없으면 null. */
export function yearLabel(dates?: string[]): string | null {
  if (!dates || !dates.length) return null;
  const years = dates.map((d) => d.slice(0, 4)).sort();
  const a = years[0]!;
  const b = years[years.length - 1]!;
  return a === b ? a : `${a}–${b}`;
}

export function toPublicAchievement(a: Achievement, projectIds: Set<string>): PublicAchievement {
  return {
    id: a.id,
    title: a.title,
    problem: a.problem,
    approach: a.approach,
    result: a.result,
    tech: a.tech ?? [],
    theme: a.theme,
    projectId: a.projectId && projectIds.has(a.projectId) ? a.projectId : undefined,
    star: Boolean(a.star),
    year: yearLabel(a.sourceDates),
  };
}

export function toPublicProject(p: Project, achievementCount: number): PublicProject {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    start: p.start?.date || p.start?.note
      ? { date: p.start.date ? formatYearMonth(p.start.date) : undefined, note: p.start.note }
      : undefined,
    end: p.end
      ? {
          ongoing: p.end.ongoing || undefined,
          date: p.end.date ? formatYearMonth(p.end.date) : undefined,
          note: p.end.note,
        }
      : undefined,
    legacyPeriod: p.start?.date ? undefined : p.period,
    photos: (p.photos ?? []).map((ph) => ({
      id: ph.id,
      width: ph.width,
      height: ph.height,
      caption: ph.caption,
    })),
    achievementCount,
  };
}

export function toPublicCareer(c: CareerEntry, now: string): PublicCareer {
  const until = c.current ? now : c.end;
  return {
    id: c.id,
    org: c.org,
    role: c.role,
    start: c.start ? formatYearMonth(c.start) : undefined,
    end: !c.current && c.end ? formatYearMonth(c.end) : undefined,
    current: Boolean(c.current),
    duration: c.start && until ? formatDuration(monthsInclusive(c.start, until)) : undefined,
    legacyPeriod: c.start ? undefined : c.period,
    note: c.note,
  };
}

export function toPublicProfile(p: Profile, now: string): PublicProfile {
  const ranges = p.career
    .filter((c) => c.start && (c.current || c.end))
    .map((c) => ({ start: c.start!, end: c.current ? now : c.end! }));
  const total = totalMonths(ranges);
  return {
    name: p.name,
    headline: p.headline,
    emailEncoded: p.email ? Buffer.from(p.email, "utf8").toString("base64") : undefined,
    links: (p.links ?? []).map((l) => ({ label: l.label, url: l.url })),
    intro: p.intro,
    techStack: p.techStack,
    career: p.career.map((c) => toPublicCareer(c, now)),
    totalCareer: total ? formatDuration(total) : undefined,
  };
}

/** 저장 데이터 → 공개 데이터. hidden 제외, 최신순, 허용 필드만. (순수 함수 — 테스트 대상) */
export function buildShowcase(
  achievements: Achievement[],
  projects: Project[],
  profile: Profile,
  now: string = currentYearMonth(todayKst()),
): ShowcaseData {
  const projectIds = new Set(projects.map((p) => p.id));
  const visible = achievements
    .filter((a) => !a.hidden)
    .sort((x, y) => sortKey(y).localeCompare(sortKey(x)))
    .map((a) => toPublicAchievement(a, projectIds));
  const count = new Map<string, number>();
  for (const a of visible) if (a.projectId) count.set(a.projectId, (count.get(a.projectId) ?? 0) + 1);
  return {
    profile: toPublicProfile(profile, now),
    projects: sortProjects(projects).map((p) => toPublicProject(p, count.get(p.id) ?? 0)),
    achievements: visible,
  };
}

export async function loadShowcase(): Promise<ShowcaseData> {
  const empty = buildShowcase([], [], DEFAULT_PROFILE);
  if (!isStoreConfigured()) return empty;
  try {
    const [aStore, pStore, prStore] = await Promise.all([
      getAchievementStore(),
      getProjectStore(),
      getProfileStore(),
    ]);
    const [achievements, projects, profile] = await Promise.all([
      aStore ? aStore.list() : Promise.resolve([] as Achievement[]),
      pStore ? pStore.list() : Promise.resolve([] as Project[]),
      prStore ? prStore.get() : Promise.resolve(DEFAULT_PROFILE),
    ]);
    return buildShowcase(achievements, projects, profile);
  } catch {
    return empty;
  }
}
