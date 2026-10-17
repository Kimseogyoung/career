import "server-only";
import {
  getAchievementStore,
  getProfileStore,
  getProjectStore,
  isStoreConfigured,
} from "@/lib/store/instance";
import { DEFAULT_PROFILE } from "@/lib/store/profile";
import type { Achievement, Profile, Project } from "@/lib/store/types";
import type { PublicAchievement, PublicProject } from "./types";

// 공개 Showcase가 노출하는 데이터만 모은다. 기록(journal)·요약·설정·비밀값은 절대 읽지 않는다.
// 성과는 hidden 을 제외하고 전부 공개(기본 공개). 저장 타입은 공개 DTO 로 바꿔 내보낸다. ADR-013.

export interface ShowcaseData {
  profile: Profile;
  projects: PublicProject[];
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

export function toPublicProject(p: Project): PublicProject {
  return { id: p.id, name: p.name, period: p.period, description: p.description };
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

/** 저장 데이터 → 공개 데이터. hidden 제외, 최신순, 허용 필드만. (순수 함수 — 테스트 대상) */
export function buildShowcase(
  achievements: Achievement[],
  projects: Project[],
  profile: Profile,
): ShowcaseData {
  const projectIds = new Set(projects.map((p) => p.id));
  const visible = achievements
    .filter((a) => !a.hidden)
    .sort((x, y) => sortKey(y).localeCompare(sortKey(x)))
    .map((a) => toPublicAchievement(a, projectIds));
  return { profile, projects: projects.map(toPublicProject), achievements: visible };
}

export async function loadShowcase(): Promise<ShowcaseData> {
  const empty: ShowcaseData = { profile: DEFAULT_PROFILE, projects: [], achievements: [] };
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
