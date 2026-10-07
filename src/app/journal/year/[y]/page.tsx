import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore, isStoreConfigured } from "@/lib/store/instance";
import { DEFAULT_SETTINGS } from "@/lib/store/settings";
import { getSettingsStore } from "@/lib/store/instance";
import { MONTHS_EN, firstOfMonth } from "@/lib/calendar";
import { isoWeek } from "@/lib/calendar";
import type { Category, IndexDay, IndexFile } from "@/lib/store/types";
import { emptyIndex } from "@/lib/store/store";
import { JournalNav } from "../../journal-nav";
import styles from "../../journal.module.css";

export const dynamic = "force-dynamic";
const Y_RE = /^\d{4}$/;

function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function firstDow(y: number, m: number) {
  return (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
}

// 최다 카테고리 색 + 횟수만큼 명도(깃 잔디). 인덱스에 top 없으면 categories[0]/count 로 폴백.
function cellStyle(info: IndexDay | undefined, catColor: Map<string, string>): string {
  if (!info || info.count === 0) return "";
  const top = info.top ?? info.categories[0];
  const color = top ? catColor.get(top) : undefined;
  if (!color) return "";
  const n = info.topCount ?? info.count;
  const pct = n >= 3 ? 100 : n === 2 ? 68 : 38;
  return `color-mix(in srgb, ${color} ${pct}%, var(--surface-2))`;
}

export default async function YearPage({ params }: { params: Promise<{ y: string }> }) {
  const { y: yStr } = await params;
  if (!Y_RE.test(yStr)) notFound();
  const y = Number(yStr);

  const configured = isStoreConfigured();
  let index: IndexFile = emptyIndex();
  let categories: Category[] = DEFAULT_SETTINGS.categories;
  let stale = false;
  if (configured) {
    try {
      const store = await getStore();
      const settingsStore = await getSettingsStore();
      if (store) {
        index = await store.getIndex();
        stale = store.syncStatus().degraded;
      }
      if (settingsStore) categories = (await settingsStore.get()).categories;
    } catch {
      stale = true;
    }
  }
  const catColor = new Map(categories.map((c) => [c.id, c.color]));

  const minis = [];
  for (let m = 1; m <= 12; m++) {
    const dim = daysInMonth(y, m);
    const lead = firstDow(y, m);
    const cells = [];
    let rec = 0;
    for (let i = 0; i < lead; i++)
      cells.push(<i key={`e${i}`} className={`${styles.md} ${styles.empty}`} />);
    for (let d = 1; d <= dim; d++) {
      const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const info = index.days[date];
      if (info && info.count > 0) rec++;
      const bg = cellStyle(info, catColor);
      cells.push(<i key={d} className={styles.md} style={bg ? { background: bg } : undefined} />);
    }
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    minis.push(
      <Link key={m} href={`/journal/month/${ym}`} className={styles.mini}>
        <h3>
          {MONTHS_EN[m - 1]}
          <small>{rec}d</small>
        </h3>
        <div className={styles.miniGrid}>{cells}</div>
      </Link>,
    );
  }

  return (
    <main className={styles.shell}>
      <JournalNav view="year" y={y} ym={`${y}-01`} isoWeek={isoWeek(firstOfMonth(`${y}-01`))} />
      <h1 className={styles.vtitle}>{y}</h1>
      {!configured ? (
        <p className={styles.banner}>원격 저장소가 설정되지 않았습니다.</p>
      ) : stale ? (
        <p className={styles.banner}>원격 저장소에 연결하지 못했습니다. 최신이 아닐 수 있습니다.</p>
      ) : null}
      <div className={styles.legend}>
        {categories.map((c) => (
          <span key={c.id} className={styles.lg}>
            <i style={{ background: c.color }} />
            {c.label}
          </span>
        ))}
        <span className={styles.lg} style={{ opacity: 0.75 }}>
          · 진할수록 그 일을 많이 한 날
        </span>
      </div>
      <div className={styles.yearGrid}>{minis}</div>
    </main>
  );
}
