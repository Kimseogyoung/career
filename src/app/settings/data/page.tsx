import Link from "next/link";
import { isStoreConfigured } from "@/lib/store/instance";
import { HistoryView } from "./history-view";
import styles from "../settings.module.css";

export const dynamic = "force-dynamic";

export default function DataPage() {
  const configured = isStoreConfigured();
  return (
    <main className={styles.shell}>
      <div className={styles.header}>
        <h1 className={styles.title}>데이터 · 복구</h1>
        <Link className={styles.backLink} href="/settings">
          설정
        </Link>
      </div>
      {!configured ? (
        <p className={styles.note}>원격 저장소가 설정되지 않았습니다.</p>
      ) : (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>내보내기 · 시점 복원</h2>
          <HistoryView />
        </section>
      )}
    </main>
  );
}
