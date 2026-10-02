import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore, isStoreConfigured } from "@/lib/store/instance";
import { canGenerate } from "@/lib/summary/summarizer";
import { isoWeekDates } from "@/lib/calendar";
import { formatKoreanDate } from "@/lib/time";
import type { Summary } from "@/lib/store/types";
import { SummaryPanel } from "@/app/summary-panel";
import styles from "@/app/period.module.css";

export const dynamic = "force-dynamic";
const WEEK_RE = /^\d{4}-W\d{2}$/;

// 주 상세 — 주간 요약 + 그 주 7일의 일간 요약.
export default async function WeekPage({ params }: { params: Promise<{ isoWeek: string }> }) {
  const { isoWeek } = await params;
  if (!WEEK_RE.test(isoWeek)) notFound();

  const dates = isoWeekDates(isoWeek);
  const configured = isStoreConfigured();
  let weekSummary: Summary | null = null;
  let dayHeads: { date: string; head: string }[] = [];
  let stale = false;

  if (configured) {
    try {
      const store = await getStore();
      if (store) {
        weekSummary = await store.getWeekSummary(isoWeek);
        dayHeads = await Promise.all(
          dates.map(async (d) => {
            const day = await store.getDay(d);
            const head = day.summary?.text?.trim().split("\n")[0] ?? day.entries[0]?.content ?? "";
            return { date: d, head };
          }),
        );
        stale = store.syncStatus().degraded;
      }
    } catch {
      stale = true;
    }
  }

  return (
    <main className={styles.shell}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{isoWeek} 주간</h1>
          <p className={styles.sub}>
            {formatKoreanDate(dates[0]!)} – {formatKoreanDate(dates[6]!)}
          </p>
        </div>
        <nav className={styles.nav}>
          <Link className={styles.navLink} href="/">
            달력
          </Link>
        </nav>
      </div>

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

      <p className={styles.listTitle}>이 주의 일별 기록</p>
      {dayHeads.map(({ date, head }) => (
        <Link key={date} href={`/day/${date}`} className={styles.item}>
          <div className={styles.itemLabel}>{formatKoreanDate(date)}</div>
          {head ? <div className={styles.itemHead}>{head}</div> : null}
        </Link>
      ))}
    </main>
  );
}
