// 헤더 둘째 줄 섹션 메뉴(커리어 탭 · 일지 연/월/주). 경로만 보고 정한다 — 페이지가 따로 그리지 않는다.
import { firstOfMonth, isoWeek, isoWeekDates } from "@/lib/calendar";

export interface SectionTab {
  href: string;
  label: string;
  on: boolean;
}

const CAREER = [
  { href: "/career", label: "성과" },
  { href: "/career/projects", label: "프로젝트" },
  { href: "/career/me", label: "내 정보" },
  { href: "/career/export", label: "내보내기" },
  { href: "/career/positions", label: "추천 포지션" },
];

function careerTabs(path: string): SectionTab[] {
  return CAREER.map((t) => ({
    ...t,
    on: path === t.href || (t.href !== "/career" && path.startsWith(`${t.href}/`)),
  }));
}

/** 일지: 지금 보고 있는 날짜 맥락을 유지한 채 연·월·주를 오간다. */
function journalTabs(path: string, today: string): SectionTab[] {
  const m = path.match(/^\/journal\/(year|month|week|day)\/([^/]+)/);
  const view = m?.[1] ?? "month";
  const key = m?.[2] ?? today.slice(0, 7);
  let y = today.slice(0, 4);
  let ym = today.slice(0, 7);
  let week = isoWeek(today);
  if (view === "year" && /^\d{4}$/.test(key)) {
    y = key;
    ym = `${key}-01`;
    week = isoWeek(firstOfMonth(ym));
  } else if (view === "month" && /^\d{4}-\d{2}$/.test(key)) {
    y = key.slice(0, 4);
    ym = key;
    week = today.startsWith(key) ? isoWeek(today) : isoWeek(firstOfMonth(key));
  } else if (view === "week" && /^\d{4}-W\d{2}$/.test(key)) {
    const first = isoWeekDates(key)[0]!;
    y = first.slice(0, 4);
    ym = first.slice(0, 7);
    week = key;
  } else if (view === "day" && /^\d{4}-\d{2}-\d{2}$/.test(key)) {
    y = key.slice(0, 4);
    ym = key.slice(0, 7);
    week = isoWeek(key);
  }
  return [
    { href: `/journal/year/${y}`, label: "연", on: view === "year" },
    { href: `/journal/month/${ym}`, label: "월", on: view === "month" },
    { href: `/journal/week/${week}`, label: "주", on: view === "week" || view === "day" },
  ];
}

export function sectionTabs(path: string, today: string): { label: string; tabs: SectionTab[] } | null {
  if (path === "/career" || path.startsWith("/career/")) return { label: "커리어 메뉴", tabs: careerTabs(path) };
  if (path === "/journal" || path.startsWith("/journal/")) return { label: "일지 보기", tabs: journalTabs(path, today) };
  return null;
}
