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
      </div>
    </main>
  );
}
