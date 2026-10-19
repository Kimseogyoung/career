import Link from "next/link";
import { monthShort, weekRangeLabel } from "@/lib/calendar";
import styles from "./journal-nav.module.css";

// 일지 브레드크럼(연 › 월 › 주 › 일). 연·월·주 전환은 헤더 둘째 줄(section-tabs). 서버 컴포넌트(링크만).
export interface JournalCtx {
  view: "year" | "month" | "week" | "day";
  y: number;
  ym: string; // "YYYY-MM"
  isoWeek: string; // "YYYY-Www"
  date?: string; // "YYYY-MM-DD" (day)
}

export function JournalNav(ctx: JournalCtx) {
  const crumbs: { label: string; href?: string; cur?: boolean }[] = [];
  crumbs.push({
    label: `${ctx.y}`,
    href: ctx.view === "year" ? undefined : `/journal/year/${ctx.y}`,
    cur: ctx.view === "year",
  });
  if (ctx.view !== "year") {
    crumbs.push({
      label: monthShort(ctx.ym),
      href: ctx.view === "month" ? undefined : `/journal/month/${ctx.ym}`,
      cur: ctx.view === "month",
    });
  }
  if (ctx.view === "week" || ctx.view === "day") {
    crumbs.push({
      label: `${weekRangeLabel(ctx.isoWeek)} 주`,
      href: ctx.view === "week" ? undefined : `/journal/week/${ctx.isoWeek}`,
      cur: ctx.view === "week",
    });
  }
  if (ctx.view === "day" && ctx.date) {
    crumbs.push({
      label: `${Number(ctx.date.slice(5, 7))}/${Number(ctx.date.slice(8))}`,
      cur: true,
    });
  }

  return (
    <div className={styles.bar}>
      <nav className={styles.crumbs} aria-label="경로">
        {crumbs.map((c, i) => (
          <span key={i} className={styles.crumbPart}>
            {i > 0 ? <span className={styles.sep}>›</span> : null}
            {c.href ? (
              <Link href={c.href} className={styles.crumbLink}>
                {c.label}
              </Link>
            ) : (
              <span className={styles.cur}>{c.label}</span>
            )}
          </span>
        ))}
      </nav>
    </div>
  );
}
