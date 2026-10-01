import { LogoutButton } from "./logout-button";
import styles from "./page.module.css";

/**
 * 0단계 자리표시자. 1-3에서 월 달력으로 교체된다.
 */
export default function HomePage() {
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.title}>Career Log</h1>
        <LogoutButton />
      </header>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>0단계 — 뼈대</h2>
        <p className={styles.muted}>배포 경로와 인증까지 완료. 기록 기능은 1단계에서 올라온다.</p>
        <ul className={styles.checklist}>
          <li className={styles.done}>✓ Next.js 스캐폴드 · TypeScript · ESLint · Prettier</li>
          <li className={styles.done}>✓ Dockerfile(standalone) · docker compose</li>
          <li className={styles.done}>✓ /api/health</li>
          <li className={styles.done}>✓ 단일 사용자 로그인 · 세션 미들웨어</li>
          <li>다음 — 1-1 원격 저장 계층</li>
        </ul>
      </section>
    </main>
  );
}
