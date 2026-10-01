import Link from "next/link";
import { notFound } from "next/navigation";
import { getSettingsStore, getStore, isStoreConfigured } from "@/lib/store/instance";
import { DEFAULT_SETTINGS } from "@/lib/store/settings";
import { isValidDate } from "@/lib/validation";
import { formatKoreanDate, shiftDate } from "@/lib/time";
import type { Entry } from "@/lib/store/types";
import { DayGrid } from "./day-grid";
import styles from "./day.module.css";

export const dynamic = "force-dynamic";

// 일 상세. 서버 컴포넌트에서 store 를 직접 읽어 HTTP 왕복을 줄인다(인증은 미들웨어가 처리).
export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isValidDate(date)) notFound();

  const configured = isStoreConfigured();
  let entries: Entry[] = [];
  let stale = false;
  let settings = DEFAULT_SETTINGS;

  if (configured) {
    try {
      const store = await getStore();
      const settingsStore = await getSettingsStore();
      if (store) {
        const day = await store.getDay(date);
        entries = day.entries;
        stale = store.syncStatus().degraded;
      }
      if (settingsStore) settings = await settingsStore.get();
    } catch {
      // 원격 장애. 캐시에 없으면 빈 상태로라도 화면은 띄운다(제약 6).
      stale = true;
    }
  }

  const prev = shiftDate(date, -1);
  const next = shiftDate(date, 1);

  return (
    <main className={styles.shell}>
      <div className={styles.header}>
        <h1 className={styles.date}>{formatKoreanDate(date)}</h1>
        <nav className={styles.nav}>
          <Link className={styles.navLink} href={`/day/${prev}`}>
            ← 이전
          </Link>
          <Link className={styles.navLink} href={`/day/${next}`}>
            다음 →
          </Link>
          <Link className={styles.backLink} href="/">
            홈
          </Link>
        </nav>
      </div>

      {!configured ? (
        <p className={styles.banner}>
          원격 저장소가 설정되지 않았습니다. <code>.env</code> 의 STORE_GITHUB_TOKEN /
          STORE_GITHUB_REPO 를 채우면 기록이 저장됩니다. (지금은 입력해도 보관되지 않습니다.)
        </p>
      ) : stale ? (
        <p className={styles.banner}>
          원격 저장소에 연결하지 못했습니다. 최신이 아닐 수 있고, 지금 작성한 기록은 큐에 쌓여
          연결되면 자동 반영됩니다.
        </p>
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
