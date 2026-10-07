import Link from "next/link";
import { monthShort, weekRangeLabel } from "@/lib/calendar";
import styles from "./journal-nav.module.css";

// 일지 내부 보기 전환(Year·Month·Week) + 브레드크럼. 서버 컴포넌트(링크만).
export interface JournalCtx {
  view: "year" | "month" | "week" | "day";
  y: number;
  ym: string; // "YYYY-MM"
  isoWeek: string; // "YYYY-Www"
  date?: string; // "YYYY-MM-DD" (day)
}

export function JournalNav(ctx: JournalCtx) {
  const views: { key: JournalCtx["view"]; label: string; href: string }[] = [
    { key: "year", label: "Year", href: `/journal/year/${ctx.y}` },
    { key: "month", label: "Month", href: `/journal/month/${ctx.ym}` },
    { key: "week", label: "Week", href: `/journal/week/${ctx.isoWeek}` },
  ];

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
      <div className={styles.seg} role="group" aria-label="보기">
        {views.map((v) => {
          const on = ctx.view === v.key || (ctx.view === "day" && v.key === "week");
          return (
            <Link key={v.key} href={v.href} className={styles.segBtn} data-on={on}>
              {v.label}
            </Link>
          );
        })}
      </div>
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
