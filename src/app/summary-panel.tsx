"use client";

import { useState } from "react";
import type { Summary } from "@/lib/store/types";
import styles from "./summary-panel.module.css";

interface Props {
  scope: "day" | "week" | "month";
  summaryKey: string; // date / isoWeek / ym
  title: string;
  initial: Summary | null;
  canGenerate: boolean;
}

// 일/주/월 요약 패널. 조회·AI 생성·수동 편집을 한 컴포넌트로.
export function SummaryPanel({ scope, summaryKey, title, initial, canGenerate }: Props) {
  const [summary, setSummary] = useState<Summary | null>(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial?.text ?? "");
  const [busy, setBusy] = useState<"gen" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/summary/${scope}/${encodeURIComponent(summaryKey)}`;

  async function generate() {
    setBusy("gen");
    setError(null);
    try {
      const res = await fetch(`${base}/generate`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        summary?: Summary | null;
        reason?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(body.message ?? "생성에 실패했습니다.");
        return;
      }
      if (body.summary) {
        setSummary(body.summary);
        setDraft(body.summary.text);
      } else {
        setError(
          body.reason === "no_key_or_empty"
            ? "생성할 기록이 없거나 API 키가 없습니다. 직접 작성하세요."
            : "요약이 비어 있습니다.",
        );
      }
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    setError(null);
    try {
      const res = await fetch(base, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: draft }),
      });
      const body = (await res.json().catch(() => ({}))) as { summary?: Summary; message?: string };
      if (!res.ok || !body.summary) {
        setError(body.message ?? "저장에 실패했습니다.");
        return;
      }
      setSummary(body.summary);
      setEditing(false);
    } finally {
      setBusy(null);
    }
  }

  const origin = summary
    ? summary.editedAt
      ? "직접 작성/수정"
      : summary.generatedBy === "ai"
        ? `AI 생성 (${summary.model ?? "모델"})`
        : "직접 작성"
    : null;

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.actions}>
          {canGenerate ? (
            <button className={styles.btn} onClick={generate} disabled={busy !== null}>
              {busy === "gen" ? "생성 중…" : summary ? "AI 재생성" : "AI 생성"}
            </button>
          ) : null}
          {editing ? (
            <>
              <button
                className={styles.btn}
                onClick={() => setEditing(false)}
                disabled={busy !== null}
              >
                취소
              </button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={save}
                disabled={busy !== null}
              >
                {busy === "save" ? "저장 중…" : "저장"}
              </button>
            </>
          ) : (
            <button
              className={styles.btn}
              onClick={() => {
                setDraft(summary?.text ?? "");
                setEditing(true);
              }}
            >
              {summary ? "수정" : "직접 작성"}
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <textarea
          className={styles.textarea}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="요약을 작성하세요"
          autoFocus
        />
      ) : summary?.text ? (
        <>
          <div className={styles.text}>{summary.text}</div>
          {origin ? <p className={styles.meta}>{origin}</p> : null}
        </>
      ) : (
        <p className={styles.empty}>아직 요약이 없습니다.</p>
      )}

      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}
