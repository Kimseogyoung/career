"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Category, CategoryId, IndexDay } from "@/lib/store/types";
import { isoWeek, monthOfDate } from "@/lib/calendar";
import { dayColor, holidayName } from "@/lib/holidays";
import styles from "../../journal.module.css";

interface Props {
  month: string;
  weeks: string[][];
  days: Record<string, IndexDay>;
  weekSummaries: Record<string, { head: string; hasSummary: boolean }>;
  categories: Category[];
  today: string;
}

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

export function MonthView({ month, weeks, days, weekSummaries, categories, today }: Props) {
  const [activeCat, setActiveCat] = useState<CategoryId | null>(null);
  const catColor = useMemo(() => new Map(categories.map((c) => [c.id, c.color])), [categories]);

  return (
    <>
      <div className={styles.filters}>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={styles.chip}
            data-on={activeCat === c.id}
            style={{ ["--chip" as string]: c.color }}
            onClick={() => setActiveCat((cur) => (cur === c.id ? null : c.id))}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className={styles.weekhead}>
        {WEEKDAYS.map((w, i) => (
          <span key={w} className={i === 5 ? styles.sat : i === 6 ? styles.sun : ""}>
            {w}
          </span>
        ))}
      </div>

      {weeks.map((week) => {
        const wk = isoWeek(week[0]!);
        const summary = weekSummaries[wk];
        return (
          <div key={wk} className={styles.week}>
            <div className={styles.days}>
              {week.map((date) => {
                const info = days[date];
                const inMonth = monthOfDate(date) === month;
                const dimmed = activeCat !== null && !(info?.categories ?? []).includes(activeCat);
                const col = dayColor(date);
                const hol = holidayName(date);
                const numCls = [
                  styles.dayNum,
                  col === "holiday" ? styles.holiday : "",
                  col === "sun" ? styles.sun : "",
                  col === "sat" ? styles.sat : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                const cls = [
                  styles.cell,
                  inMonth ? "" : styles.cellOther,
                  date === today ? styles.cellToday : "",
                  dimmed ? styles.cellDimmed : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <Link key={date} href={`/journal/day/${date}`} className={cls}>
                    <span className={styles.cellTop}>
                      <span className={numCls}>{Number(date.slice(8))}</span>
                      <span className={styles.dots}>
                        {(info?.categories ?? []).map((cat) => (
                          <i
                            key={cat}
                            className={styles.dot}
                            style={{ background: catColor.get(cat) }}
                          />
                        ))}
                      </span>
                    </span>
                    {hol ? <span className={styles.hname}>{hol}</span> : null}
                    {info?.head ? <span className={styles.cellHead}>{info.head}</span> : null}
                  </Link>
                );
              })}

              <Link href={`/journal/week/${wk}`} className={styles.wsum}>
                <b>주간 요약</b>
                {summary?.head ? (
                  <span className={styles.txt}>{summary.head}</span>
                ) : (
                  <span className={styles.txt} style={{ opacity: 0.6 }}>
                    아직 없음
                  </span>
                )}
                <span className={styles.go}>주 보기 ›</span>
              </Link>
            </div>
          </div>
        );
      })}
    </>
  );
}
