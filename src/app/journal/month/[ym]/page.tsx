import { notFound } from "next/navigation";
import { getSettingsStore, getStore, isStoreConfigured } from "@/lib/store/instance";
import { DEFAULT_SETTINGS } from "@/lib/store/settings";
import { isoWeek, monthGrid, monthLabel } from "@/lib/calendar";
import { todayKst } from "@/lib/time";
import type { IndexDay } from "@/lib/store/types";
import { JournalNav } from "../../journal-nav";
import { MonthView } from "./month-view";
import styles from "../../journal.module.css";

export const dynamic = "force-dynamic";
const YM_RE = /^\d{4}-\d{2}$/;

export default async function MonthPage({ params }: { params: Promise<{ ym: string }> }) {
  const { ym } = await params;
  if (!YM_RE.test(ym)) notFound();

  const today = todayKst();
  const weeks = monthGrid(ym);
  const configured = isStoreConfigured();
  let days: Record<string, IndexDay> = {};
  let weekSummaries: Record<string, { head: string; hasSummary: boolean }> = {};
  let settings = DEFAULT_SETTINGS;
  let stale = false;

  if (configured) {
    try {
      const store = await getStore();
      const settingsStore = await getSettingsStore();
      if (store) {
        const index = await store.getIndex();
        days = index.days;
        weekSummaries = index.weeks;
        stale = store.syncStatus().degraded;
      }
      if (settingsStore) settings = await settingsStore.get();
    } catch {
      stale = true;
    }
  }

  return (
    <main className={styles.shell}>
      <JournalNav view="month" y={Number(ym.slice(0, 4))} ym={ym} isoWeek={isoWeek(today)} />
      <h1 className={styles.vtitle}>{monthLabel(ym)}</h1>
      {!configured ? (
        <p className={styles.banner}>
          원격 저장소가 설정되지 않았습니다. 기록이 아직 표시되지 않습니다.
        </p>
      ) : stale ? (
        <p className={styles.banner}>원격 저장소에 연결하지 못했습니다. 최신이 아닐 수 있습니다.</p>
      ) : null}
      <MonthView
        month={ym}
        weeks={weeks}
        days={days}
        weekSummaries={weekSummaries}
        categories={settings.categories}
        today={today}
      />
    </main>
  );
}
