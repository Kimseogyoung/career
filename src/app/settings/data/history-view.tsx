"use client";

import { useEffect, useState } from "react";
import styles from "../settings.module.css";

interface Commit {
  sha: string;
  message: string;
  date: string;
  author: string;
}

// 커밋 이력 조회 + 특정 시점 복원 + JSON 내보내기.
export function HistoryView() {
  const [commits, setCommits] = useState<Commit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 순수 fetch(상태 변경 없음). 호출 측에서 결과로 setState 한다.
  async function fetchCommits(): Promise<{ commits?: Commit[]; error?: string }> {
    try {
      const res = await fetch("/api/sync/history");
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        return { error: b.message ?? "이력을 불러오지 못했습니다." };
      }
      const b = (await res.json()) as { commits: Commit[] };
      return { commits: b.commits };
    } catch {
      return { error: "이력을 불러오지 못했습니다." };
    }
  }

  async function reload() {
    const r = await fetchCommits();
    setError(r.error ?? null);
    if (r.commits) setCommits(r.commits);
  }

  useEffect(() => {
    let cancelled = false;
    void fetchCommits().then((r) => {
      if (cancelled) return;
      setError(r.error ?? null);
      if (r.commits) setCommits(r.commits);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function restore(sha: string) {
    if (!confirm(`${sha.slice(0, 7)} 시점으로 전체를 되돌립니다. 계속할까요?`)) return;
    setRestoring(sha);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/sync/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha }),
      });
      const b = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setError(b.message ?? "복원에 실패했습니다.");
        return;
      }
      setNotice("복원했습니다. 달력·일 상세를 새로고침하면 반영됩니다.");
      void reload();
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div>
      <p className={styles.note}>
        모든 기록 변경은 데이터 레포에 커밋으로 남습니다. 아래에서 과거 시점으로 되돌릴 수 있습니다.
      </p>
      <a
        className={styles.primary}
        href="/api/export"
        style={{ display: "inline-block", textDecoration: "none", marginBottom: "12px" }}
      >
        전체 JSON 내보내기
      </a>

      {notice ? <p className={styles.saved}>{notice}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      {commits === null && !error ? (
        <p className={styles.note}>이력 불러오는 중…</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {(commits ?? []).map((c, i) => (
            <li
              key={c.sha}
              style={{
                borderTop: "1px solid var(--border)",
                padding: "8px 0",
                display: "flex",
                gap: "10px",
                alignItems: "baseline",
                justifyContent: "space-between",
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ fontSize: 13 }}>{c.message}</span>
                <br />
                <span className={styles.note} style={{ margin: 0 }}>
                  {new Date(c.date).toLocaleString("ko-KR")} · {c.sha.slice(0, 7)}
                </span>
              </span>
              {i === 0 ? (
                <span className={styles.note} style={{ margin: 0, whiteSpace: "nowrap" }}>
                  현재
                </span>
              ) : (
                <button
                  className={styles.secondary}
                  onClick={() => restore(c.sha)}
                  disabled={restoring !== null}
                  style={{ whiteSpace: "nowrap" }}
                >
                  {restoring === c.sha ? "복원 중…" : "이 시점으로"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
