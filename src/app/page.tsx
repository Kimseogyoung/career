import Link from "next/link";
import { LogoutButton } from "./logout-button";
import { ThemeToggle } from "@/app/components/theme-toggle";
import { CalendarView } from "./calendar-view";
import { getSettingsStore, getStore, isStoreConfigured } from "@/lib/store/instance";
import { DEFAULT_SETTINGS } from "@/lib/store/settings";
import { monthGrid, monthLabel, monthOfDate, shiftMonth } from "@/lib/calendar";
import { todayKst } from "@/lib/time";
import type { IndexDay } from "@/lib/store/types";
import styles from "./calendar.module.css";

export const dynamic = "force-dynamic";

const MONTH_RE = /^\d{4}-\d{2}$/;

// 월 달력 — 기본 화면. index.json 만 읽어 그 달을 렌더한다(원격 fetch 1회).
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const today = todayKst();
  const sp = await searchParams;
  const month = sp.month && MONTH_RE.test(sp.month) ? sp.month : monthOfDate(today);

  const weeks = monthGrid(month);
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
      <div className={styles.topbar}>
        <div className={styles.monthNav}>
          <Link
            className={styles.navBtn}
            href={`/?month=${shiftMonth(month, -1)}`}
            aria-label="이전 달"
          >
            ‹
          </Link>
          <Link
            className={styles.monthTitle}
            href={`/month/${month}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            {monthLabel(month)}
          </Link>
          <Link
            className={styles.navBtn}
            href={`/?month=${shiftMonth(month, 1)}`}
            aria-label="다음 달"
          >
            ›
          </Link>
          <Link className={styles.todayBtn} href={`/?month=${monthOfDate(today)}`}>
            오늘
          </Link>
        </div>
        <div className={styles.monthNav}>
          <ThemeToggle variant="compact" />
          <Link className={styles.todayBtn} href="/settings">
            설정
          </Link>
          <LogoutButton />
        </div>
      </div>

      {!configured ? (
        <p className={styles.banner}>
          원격 저장소가 설정되지 않았습니다. <code>.env</code> 를 채우면 기록이 달력에 나타납니다.
        </p>
      ) : stale ? (
        <p className={styles.banner}>원격 저장소에 연결하지 못했습니다. 최신이 아닐 수 있습니다.</p>
      ) : null}

      <CalendarView
        month={month}
        weeks={weeks}
        days={days}
        weekSummaries={weekSummaries}
        categories={settings.categories}
        today={today}
      />
    </main>
  );
}
