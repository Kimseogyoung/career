import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore, isStoreConfigured } from "@/lib/store/instance";
import { canGenerate } from "@/lib/summary/summarizer";
import { isoWeekDates, weekRangeLabel } from "@/lib/calendar";
import { dayColor, holidayName } from "@/lib/holidays";
import type { Entry, Summary } from "@/lib/store/types";
import { SummaryPanel } from "@/app/summary-panel";
import { JournalNav } from "../../journal-nav";
import styles from "../../journal.module.css";

export const dynamic = "force-dynamic";
const WEEK_RE = /^\d{4}-W\d{2}$/;
const WD = ["월", "화", "수", "목", "금", "토", "일"];

export default async function WeekPage({ params }: { params: Promise<{ isoWeek: string }> }) {
  const { isoWeek } = await params;
  if (!WEEK_RE.test(isoWeek)) notFound();

  const dates = isoWeekDates(isoWeek);
  const configured = isStoreConfigured();
  let weekSummary: Summary | null = null;
  const byDate: Record<string, Entry[]> = {};
  let stale = false;

  if (configured) {
    try {
      const store = await getStore();
      if (store) {
        weekSummary = await store.getWeekSummary(isoWeek);
        for (const d of dates) byDate[d] = (await store.getDay(d)).entries;
        stale = store.syncStatus().degraded;
      }
    } catch {
      stale = true;
    }
  }

  return (
    <main className={styles.shell}>
      <JournalNav
        view="week"
        y={Number(dates[0]!.slice(0, 4))}
        ym={dates[0]!.slice(0, 7)}
        isoWeek={isoWeek}
      />
      <h1 className={styles.vtitle}>{weekRangeLabel(isoWeek)}</h1>
      {!configured ? (
        <p className={styles.banner}>원격 저장소가 설정되지 않았습니다.</p>
      ) : stale ? (
        <p className={styles.banner}>원격 저장소에 연결하지 못했습니다. 최신이 아닐 수 있습니다.</p>
      ) : null}

      {configured ? (
        <SummaryPanel
          scope="week"
          summaryKey={isoWeek}
          title="주간 요약"
          initial={weekSummary}
          canGenerate={canGenerate()}
        />
      ) : null}

      <div className={styles.agenda}>
        {dates.map((date, i) => {
          const entries = byDate[date] ?? [];
          const col = dayColor(date);
          const hol = holidayName(date);
          const colColor =
            col === "holiday" || col === "sun"
              ? "var(--holiday)"
              : col === "sat"
                ? "var(--satblue)"
                : undefined;
          return (
            <Link key={date} href={`/journal/day/${date}`} className={styles.agDay}>
              <span className={styles.agDate}>
                <span style={{ display: "block", fontSize: 17, fontWeight: 700, color: colColor }}>
                  {Number(date.slice(8))}
                </span>
                <span style={{ fontSize: 11, color: colColor ?? "var(--text-muted)" }}>
                  {hol ?? WD[i]}
                </span>
              </span>
              <span className={styles.agItems}>
                {entries.length ? (
                  entries.map((e) => (
                    <span key={e.id} className={styles.agItem}>
                      <span className={styles.t}>{e.start}</span>
                      <span
                        className={styles.b}
                        style={{ background: `var(--cat-${e.category})` }}
                      />
                      <span className={styles.tx}>{e.content || "(내용 없음)"}</span>
                    </span>
                  ))
                ) : (
                  <span className={styles.agEmpty}>기록 없음</span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
