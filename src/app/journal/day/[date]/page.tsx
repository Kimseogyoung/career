import Link from "next/link";
import { notFound } from "next/navigation";
import { getSettingsStore, getStore, isStoreConfigured } from "@/lib/store/instance";
import { DEFAULT_SETTINGS } from "@/lib/store/settings";
import { isValidDate } from "@/lib/validation";
import { formatKoreanDate, shiftDate } from "@/lib/time";
import { isoWeek } from "@/lib/calendar";
import { holidayName } from "@/lib/holidays";
import { canGenerate } from "@/lib/summary/summarizer";
import type { Entry, Summary } from "@/lib/store/types";
import { SummaryPanel } from "@/app/summary-panel";
import { JournalNav } from "../../journal-nav";
import { DayGrid } from "./day-grid";
import styles from "./day.module.css";

export const dynamic = "force-dynamic";

export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isValidDate(date)) notFound();

  const configured = isStoreConfigured();
  let entries: Entry[] = [];
  let daySummary: Summary | null = null;
  let stale = false;
  let settings = DEFAULT_SETTINGS;

  if (configured) {
    try {
      const store = await getStore();
      const settingsStore = await getSettingsStore();
      if (store) {
        const day = await store.getDay(date);
        entries = day.entries;
        daySummary = day.summary ?? null;
        stale = store.syncStatus().degraded;
      }
      if (settingsStore) settings = await settingsStore.get();
    } catch {
      stale = true;
    }
  }

  const prev = shiftDate(date, -1);
  const next = shiftDate(date, 1);
  const hol = holidayName(date);

  return (
    <main className={styles.shell}>
      <JournalNav
        view="day"
        y={Number(date.slice(0, 4))}
        ym={date.slice(0, 7)}
        isoWeek={isoWeek(date)}
        date={date}
      />
      <div className={styles.header}>
        <h1 className={styles.date}>
          {formatKoreanDate(date)}
          {hol ? (
            <span style={{ color: "var(--holiday)", marginLeft: 8, fontSize: 14 }}>{hol}</span>
          ) : null}
        </h1>
        <nav className={styles.nav}>
          <Link className={styles.navLink} href={`/journal/day/${prev}`}>
            ← 이전
          </Link>
          <Link className={styles.navLink} href={`/journal/day/${next}`}>
            다음 →
          </Link>
        </nav>
      </div>

      {!configured ? (
        <p className={styles.banner}>
          원격 저장소가 설정되지 않았습니다. 지금 입력해도 보관되지 않습니다.
        </p>
      ) : stale ? (
        <p className={styles.banner}>
          원격 저장소에 연결하지 못했습니다. 작성한 기록은 큐에 쌓여 연결되면 반영됩니다.
        </p>
      ) : null}

      {configured ? (
        <SummaryPanel
          scope="day"
          summaryKey={date}
          title="일간 요약"
          initial={daySummary}
          canGenerate={canGenerate()}
        />
      ) : null}

      <DayGrid
        date={date}
        initialEntries={entries}
        categories={settings.categories}
        recordingHours={settings.recordingHours}
      />
    </main>
  );
}
