"use client";

import { useState } from "react";
import type { RecordingHours, ReminderSettings } from "@/lib/store/types";
import styles from "./settings.module.css";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// 기록 시간대 + 알림 요일/시간대 편집. /api/settings 로 PUT.
export function ReminderForm({
  initialRecordingHours,
  initialReminder,
}: {
  initialRecordingHours: RecordingHours;
  initialReminder: ReminderSettings;
}) {
  const [recStart, setRecStart] = useState(initialRecordingHours.start);
  const [recEnd, setRecEnd] = useState(initialRecordingHours.end);
  const [enabled, setEnabled] = useState(initialReminder.enabled);
  const [days, setDays] = useState<number[]>(initialReminder.days);
  const [remStart, setRemStart] = useState(initialReminder.hours.start);
  const [remEnd, setRemEnd] = useState(initialReminder.hours.end);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDay(d: number) {
    setSaved(false);
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordingHours: { start: recStart, end: recEnd },
          reminder: {
            enabled,
            days,
            hours: { start: remStart, end: remEnd },
            skipIfRecorded: initialReminder.skipIfRecorded,
          },
        }),
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

  return (
    <div onChange={() => setSaved(false)}>
      <div className={styles.field}>
        <span className={styles.label}>기록 시간대</span>
        <input
          className={styles.input}
          type="time"
          value={recStart}
          onChange={(e) => setRecStart(e.target.value)}
        />
        <span>–</span>
        <input
          className={styles.input}
          type="time"
          value={recEnd}
          onChange={(e) => setRecEnd(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <span className={styles.label}>알림</span>
        <label className={styles.row}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />{" "}
          켜기
        </label>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>알림 요일</span>
        <div className={styles.days}>
          {DAY_LABELS.map((lbl, d) => (
            <button
              key={d}
              type="button"
              className={styles.dayChip}
              data-on={days.includes(d)}
              onClick={() => toggleDay(d)}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>알림 시간대</span>
        <input
          className={styles.input}
          type="time"
          value={remStart}
          onChange={(e) => setRemStart(e.target.value)}
        />
        <span>–</span>
        <input
          className={styles.input}
          type="time"
          value={remEnd}
          onChange={(e) => setRemEnd(e.target.value)}
        />
      </div>

      <div className={styles.row}>
        <button className={styles.primary} onClick={save} disabled={busy}>
          {busy ? "저장 중…" : "저장"}
        </button>
        {saved ? <span className={styles.saved}>저장됨 ✓</span> : null}
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
