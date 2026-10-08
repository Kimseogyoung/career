"use client";

import { useState } from "react";
import type { SummaryPrompts } from "@/lib/store/types";
import styles from "./settings.module.css";

// AI 요약 프롬프트 편집. 비우면 서버 기본값(prompts.ts)으로 폴백. /api/settings 로 PUT.
export function SummaryPromptsForm({
  initial,
  defaults,
}: {
  initial?: SummaryPrompts;
  defaults: { system: string; day: string; week: string; month: string };
}) {
  const [system, setSystem] = useState(initial?.system ?? "");
  const [day, setDay] = useState(initial?.day ?? "");
  const [week, setWeek] = useState(initial?.week ?? "");
  const [month, setMonth] = useState(initial?.month ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summaryPrompts: { system, day, week, month } }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        setError(b.message ?? "저장에 실패했습니다.");
        return;
      }
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  function clearAll() {
    setSystem("");
    setDay("");
    setWeek("");
    setMonth("");
    setSaved(false);
  }

  return (
    <div onChange={() => setSaved(false)}>
      <div className={styles.promptField}>
        <span className={styles.label}>시스템 프롬프트</span>
        <textarea
          className={styles.textarea}
          rows={7}
          value={system}
          placeholder={defaults.system}
          onChange={(e) => setSystem(e.target.value)}
        />
      </div>
      <div className={styles.promptField}>
        <span className={styles.label}>일간 지침</span>
        <textarea
          className={styles.textarea}
          rows={2}
          value={day}
          placeholder={defaults.day}
          onChange={(e) => setDay(e.target.value)}
        />
      </div>
      <div className={styles.promptField}>
        <span className={styles.label}>주간 지침</span>
        <textarea
          className={styles.textarea}
          rows={2}
          value={week}
          placeholder={defaults.week}
          onChange={(e) => setWeek(e.target.value)}
        />
      </div>
      <div className={styles.promptField}>
        <span className={styles.label}>월간 지침</span>
        <textarea
          className={styles.textarea}
          rows={2}
          value={month}
          placeholder={defaults.month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </div>

      <div className={styles.row}>
        <button className={styles.primary} onClick={save} disabled={busy}>
          {busy ? "저장 중…" : "저장"}
        </button>
        <button className={styles.secondary} onClick={clearAll} disabled={busy} type="button">
          기본값으로
        </button>
        {saved ? <span className={styles.saved}>저장됨 ✓</span> : null}
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
