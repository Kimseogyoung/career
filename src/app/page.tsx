import Link from "next/link";
import { getSettingsStore, getStore, isStoreConfigured } from "@/lib/store/instance";
import { DEFAULT_SETTINGS } from "@/lib/store/settings";
import { isoWeek } from "@/lib/calendar";
import { todayKst, formatKoreanDate } from "@/lib/time";
import type { Category, DayRecord, MonthFile, Summary } from "@/lib/store/types";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function monthHoursByCat(month: MonthFile): Record<string, number> {
  const out: Record<string, number> = {};
  for (const day of Object.values(month.days)) {
    for (const e of day.entries) {
      const d = minutes(e.end) - minutes(e.start);
      if (d > 0) out[e.category] = (out[e.category] ?? 0) + d / 60;
    }
  }
  return out;
}

export default async function HomePage() {
  const today = todayKst();
  const ym = today.slice(0, 7);
  const wk = isoWeek(today);
  const configured = isStoreConfigured();

  let todayDay: DayRecord | null = null;
  let weekSummary: Summary | null = null;
  let hours: Record<string, number> = {};
  let recordedDays = 0;
  let categories: Category[] = DEFAULT_SETTINGS.categories;
  let stale = false;

  if (configured) {
    try {
      const store = await getStore();
      const settingsStore = await getSettingsStore();
      if (store) {
        todayDay = await store.getDay(today);
        weekSummary = await store.getWeekSummary(wk);
        const month = await store.getMonth(ym);
        hours = monthHoursByCat(month);
        recordedDays = Object.values(month.days).filter((d) => d.entries.length > 0).length;
        stale = store.syncStatus().degraded;
      }
      if (settingsStore) categories = (await settingsStore.get()).categories;
    } catch {
      stale = true;
    }
  }

  const maxH = Math.max(1, ...categories.map((c) => hours[c.id] ?? 0));
  const todayHead =
    todayDay?.summary?.text?.trim().split("\n")[0] ?? todayDay?.entries[0]?.content ?? null;

  return (
    <main className={styles.shell}>
      <h1 className={styles.title}>홈</h1>

      {!configured ? (
        <p className={styles.banner}>
          원격 저장소가 설정되지 않았습니다. <code>.env</code> 를 채우면 기록이 나타납니다.
        </p>
      ) : stale ? (
        <p className={styles.banner}>원격 저장소에 연결하지 못했습니다. 최신이 아닐 수 있습니다.</p>
      ) : null}

      <div className={styles.cards + " " + styles.two}>
        <div className={styles.card}>
          <h2>
            오늘 · {formatKoreanDate(today)}
            <Link className={styles.more} href={`/journal/day/${today}`}>
              열기 ›
            </Link>
          </h2>
          {todayDay && todayDay.entries.length ? (
            <p className={styles.sumtext}>{todayHead}</p>
          ) : (
            <p className={styles.muted}>오늘 기록이 없습니다.</p>
          )}
          <div className={styles.quick}>
            <Link className={styles.btn + " " + styles.primary} href={`/journal/day/${today}`}>
              오늘 기록
            </Link>
          </div>
        </div>

        <div className={styles.card}>
          <h2>
            이번 주
            <Link className={styles.more} href={`/journal/week/${wk}`}>
              열기 ›
            </Link>
          </h2>
          {weekSummary?.text ? (
            <p className={styles.sumtext}>{weekSummary.text.split("\n")[0]}</p>
          ) : (
            <p className={styles.muted}>아직 주간 요약이 없습니다.</p>
          )}
        </div>
      </div>

      <div className={styles.cards} style={{ marginTop: 12 }}>
        <div className={styles.card}>
          <h2>
            이번 달 · {Number(ym.slice(5))}월
            <Link className={styles.more} href={`/journal/month/${ym}`}>
              열기 ›
            </Link>
          </h2>
          <p className={styles.muted}>기록한 날 {recordedDays}일 · 카테고리별 시간</p>
          <div className={styles.bars}>
            {categories.map((c) => {
              const h = hours[c.id] ?? 0;
              return (
                <div key={c.id} className={styles.barRow}>
                  <span className={styles.lab}>{c.label}</span>
                  <span className={styles.track}>
                    <span
                      className={styles.fill}
                      style={{ width: `${Math.round((h / maxH) * 100)}%`, background: c.color }}
                    />
                  </span>
                  <span className={styles.val}>{h ? h.toFixed(1) : "0"}h</span>
                </div>
              );
            })}
          </div>
          <div className={styles.quick}>
            <Link className={styles.btn} href={`/journal/month/${ym}`}>
              이번 달
            </Link>
            <Link className={styles.btn} href={`/journal/week/${wk}`}>
              이번 주
            </Link>
            <Link className={styles.btn} href={`/journal/year/${today.slice(0, 4)}`}>
              연간 보기
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
