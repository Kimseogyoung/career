"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import styles from "./login.module.css";

const MESSAGES: Record<string, string> = {
  invalid_credentials: "비밀번호가 올바르지 않습니다.",
  too_many_attempts: "시도가 너무 많습니다. 잠시 후 다시 해주세요.",
  server_not_configured: "서버에 비밀번호가 설정되지 않았습니다. AUTH_PASSWORD_HASH를 확인하세요.",
};

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        const next = searchParams.get("next");
        // 오픈 리다이렉트 방지 — 내부 경로만 허용한다.
        router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(MESSAGES[body.error ?? ""] ?? "로그인에 실패했습니다.");
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label className={styles.label} htmlFor="password">
        비밀번호
      </label>
      <input
        id="password"
        className={styles.input}
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoFocus
        required
      />
      <button className={styles.submit} type="submit" disabled={busy || password.length === 0}>
        {busy ? "확인 중…" : "로그인"}
      </button>
      {error ? <p className={styles.error}>{error}</p> : null}
    </form>
  );
}
