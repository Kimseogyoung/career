import Link from "next/link";
import { Suspense } from "react";
import { QuickEntry } from "./quick-entry";
import { getSettingsStore, isStoreConfigured } from "@/lib/store/instance";
import { DEFAULT_SETTINGS } from "@/lib/store/settings";
import styles from "./quick.module.css";

export const dynamic = "force-dynamic";

// 푸시 알림 클릭 진입점. ?slot=YYYY-MM-DDTHH 한 슬롯만 빠르게 기록.
export default async function QuickPage() {
  let categories = DEFAULT_SETTINGS.categories;
  if (isStoreConfigured()) {
    try {
      const store = await getSettingsStore();
      if (store) categories = (await store.get()).categories;
    } catch {
      /* 기본 카테고리로 */
    }
  }

  return (
    <main className={styles.shell}>
      <div className={styles.header}>
        <h1 className={styles.title}>빠른 기록</h1>
        <Link className={styles.link} href="/">
          달력
        </Link>
      </div>
      <Suspense>
        <QuickEntry categories={categories} />
      </Suspense>
    </main>
  );
}
