import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore, isStoreConfigured } from "@/lib/store/instance";
import { canGenerate } from "@/lib/summary/summarizer";
import { isoWeek, monthGrid, monthLabel } from "@/lib/calendar";
import type { Summary } from "@/lib/store/types";
import { SummaryPanel } from "@/app/summary-panel";
import styles from "@/app/period.module.css";

export const dynamic = "force-dynamic";
const YM_RE = /^\d{4}-\d{2}$/;

// 월 상세 — 월간 요약 + 그 달의 주별 요약.
export default async function MonthPage({ params }: { params: Promise<{ ym: string }> }) {
  const { ym } = await params;
  if (!YM_RE.test(ym)) notFound();

  const weeks = [...new Set(monthGrid(ym).map((w) => isoWeek(w[0]!)))];
  const configured = isStoreConfigured();
  let monthSummary: Summary | null = null;
  let weekHeads: { wk: string; head: string }[] = [];
  let stale = false;

  if (configured) {
    try {
      const store = await getStore();
      if (store) {
        monthSummary = await store.getMonthSummary(ym);
        weekHeads = await Promise.all(
          weeks.map(async (wk) => {
            const s = await store.getWeekSummary(wk);
            return { wk, head: s?.text?.trim().split("\n")[0] ?? "" };
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
        <h1 className={styles.title}>{monthLabel(ym)} 월간</h1>
        <nav className={styles.nav}>
          <Link className={styles.navLink} href={`/?month=${ym}`}>
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
          scope="month"
          summaryKey={ym}
          title="월간 요약"
          initial={monthSummary}
          canGenerate={canGenerate()}
        />
      ) : null}

      <p className={styles.listTitle}>이 달의 주별 요약</p>
      {weekHeads.map(({ wk, head }) => (
        <Link key={wk} href={`/week/${wk}`} className={styles.item}>
          <div className={styles.itemLabel}>{wk}</div>
          {head ? <div className={styles.itemHead}>{head}</div> : null}
        </Link>
      ))}
    </main>
  );
}
