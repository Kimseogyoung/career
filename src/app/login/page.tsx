import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "./login-form";
import styles from "./login.module.css";

export default function LoginPage() {
  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <h1 className={styles.title}>Career Log</h1>
        <p className={styles.subtitle}>1인용 업무 일지</p>
        <Suspense>
          <LoginForm />
        </Suspense>
        <div className={styles.divider}>
          <span>또는</span>
        </div>
        <Link href="/showcase" className={styles.browse}>
          비밀번호 없이 포트폴리오 둘러보기 →
        </Link>
      </div>
    </main>
  );
}
