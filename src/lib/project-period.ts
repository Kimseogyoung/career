// 프로젝트 기간 표시 글자. 서버·클라이언트 공용.
import type { Project } from "@/lib/store/types";
import { formatYearMonth } from "./period";

/** "2023.01 합류 – 2024.05 출시" / "2025.03 – 개발 중". 날짜가 없으면 예전 글자. */
export function projectPeriodText(p: Pick<Project, "start" | "end" | "period">): string | undefined {
  if (!p.start?.date) return p.period;
  const start = [formatYearMonth(p.start.date), p.start.note].filter(Boolean).join(" ");
  if (!p.end) return start;
  const end = p.end.ongoing
    ? p.end.note || "진행 중"
    : [p.end.date ? formatYearMonth(p.end.date) : "", p.end.note].filter(Boolean).join(" ");
  return end ? `${start} – ${end}` : start;
}
