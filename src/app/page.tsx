import Link from "next/link";
import { LogoutButton } from "./logout-button";
import { todayKst, shiftDate, formatKoreanDate } from "@/lib/time";
import styles from "./page.module.css";

// 1-3 에서 월 달력으로 교체된다. 지금은 오늘/어제로 가는 입구만.
export default function HomePage() {
  const today = todayKst();
  const yesterday = shiftDate(today, -1);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.title}>Career Log</h1>
        <LogoutButton />
      </header>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>업무 일지</h2>
        <p className={styles.muted}>하루에 한 일을 1시간 단위로 기록합니다.</p>
        <ul className={styles.checklist}>
          <li>
            <Link className={styles.linkButton} href={`/day/${today}`}>
              오늘 — {formatKoreanDate(today)}
            </Link>
          </li>
          <li>
            <Link className={styles.linkButton} href={`/day/${yesterday}`}>
              어제 — {formatKoreanDate(yesterday)}
            </Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
