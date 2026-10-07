import Link from "next/link";
import { getSettingsStore, isStoreConfigured } from "@/lib/store/instance";
import { DEFAULT_SETTINGS } from "@/lib/store/settings";
import { isPushConfigured } from "@/lib/push";
import { canGenerate } from "@/lib/summary/summarizer";
import { NotificationSetup } from "./notification-setup";
import { ReminderForm } from "./reminder-form";
import { ThemeToggle } from "@/app/components/theme-toggle";
import styles from "./settings.module.css";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const configured = isStoreConfigured();
  let settings = DEFAULT_SETTINGS;
  if (configured) {
    try {
      const store = await getSettingsStore();
      if (store) settings = await store.get();
    } catch {
      /* 원격 장애 시 기본값으로 표시 */
    }
  }

  return (
    <main className={styles.shell}>
      <div className={styles.header}>
        <h1 className={styles.title}>설정</h1>
        <Link className={styles.backLink} href="/">
          달력
        </Link>
      </div>

      {!configured ? (
        <>
          <p className={styles.note}>
            원격 저장소가 설정되지 않아 기록 설정은 저장할 수 없습니다. <code>.env</code> 를
            채우세요.
          </p>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>테마</h2>
            <ThemeToggle />
            <p className={styles.note}>이 기기에만 적용됩니다.</p>
          </section>
        </>
      ) : (
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>테마</h2>
            <ThemeToggle />
            <p className={styles.note}>이 기기에만 적용됩니다. 시스템은 OS 설정을 따릅니다.</p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>기록 · 알림</h2>
            <ReminderForm
              initialRecordingHours={settings.recordingHours}
              initialReminder={settings.reminder}
            />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>푸시 알림 (이 기기)</h2>
            <NotificationSetup pushConfigured={isPushConfigured()} />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>데이터 · 복구</h2>
            <p className={styles.note}>전체 JSON 내보내기와 과거 시점 복원.</p>
            <Link
              className={styles.backLink}
              href="/settings/data"
              style={{ display: "inline-block", marginTop: 4 }}
            >
              데이터 · 복구 열기
            </Link>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>상태</h2>
            <p className={styles.note}>
              AI 요약:{" "}
              {canGenerate()
                ? "사용 가능 (ANTHROPIC_API_KEY 설정됨)"
                : "비활성 (키 없음 — 수동 작성)"}
              <br />
              푸시: {isPushConfigured() ? "VAPID 설정됨" : "VAPID 미설정"}
            </p>
          </section>
        </>
      )}
    </main>
  );
}
