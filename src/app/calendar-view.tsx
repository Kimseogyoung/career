"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Category, IndexDay } from "@/lib/store/types";
import { isoWeek, monthOfDate } from "@/lib/calendar";
import styles from "./calendar.module.css";

interface WeekSummary {
  head: string;
  hasSummary: boolean;
}

interface Props {
  month: string; // "2026-10"
  weeks: string[][]; // 월요일 시작 날짜 그리드
  days: Record<string, IndexDay>; // index.json 의 날짜 항목(해당 월 주변)
  weekSummaries: Record<string, WeekSummary>;
  categories: Category[];
  today: string;
}

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

export function CalendarView({ month, weeks, days, weekSummaries, categories, today }: Props) {
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const catColor = useMemo(() => new Map(categories.map((c) => [c.id, c.color])), [categories]);

  function toggle(id: string) {
    setActiveCat((cur) => (cur === id ? null : id));
  }

  return (
    <>
      <div className={styles.filters}>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={styles.filterChip}
            data-active={activeCat === c.id}
            style={{ ["--chip" as string]: c.color }}
            onClick={() => toggle(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className={styles.weekHead}>
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
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
                const dimmed =
                  activeCat !== null && !(info?.categories ?? []).includes(activeCat as never);
                const cls = [
                  styles.cell,
                  inMonth ? "" : styles.cellOtherMonth,
                  date === today ? styles.cellToday : "",
                  dimmed ? styles.cellDimmed : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <Link key={date} href={`/day/${date}`} className={cls}>
                    <div className={styles.cellTop}>
                      <span className={styles.dayNum}>{Number(date.slice(8))}</span>
                      <span className={styles.dots}>
                        {(info?.categories ?? []).map((cat) => (
                          <span
                            key={cat}
                            className={styles.dot}
                            style={{ ["--dot" as string]: catColor.get(cat) }}
                          />
                        ))}
                      </span>
                    </div>
                    {info?.head ? <div className={styles.cellHead}>{info.head}</div> : null}
                  </Link>
                );
              })}

              <div className={styles.weekSummary}>
                <b>주간 요약</b>
                {summary?.head ? (
                  <span className={styles.weekSummaryText}>{summary.head}</span>
                ) : (
                  <span className={styles.empty}>아직 없음</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
