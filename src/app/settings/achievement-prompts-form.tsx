"use client";

import { useState } from "react";
import type { AchievementPrompts } from "@/lib/store/types";
import styles from "./settings.module.css";

// 성과 추출 프롬프트 편집. system(성격·규칙)과 guide(추가 지침)만. JSON 출력 형식은 코드 고정.
export function AchievementPromptsForm({
  initial,
  defaultSystem,
}: {
  initial?: AchievementPrompts;
  defaultSystem: string;
}) {
  const [system, setSystem] = useState(initial?.system ?? "");
  const [guide, setGuide] = useState(initial?.guide ?? "");
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
        body: JSON.stringify({ achievementPrompts: { system, guide } }),
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
      <div className={styles.promptField}>
        <span className={styles.label}>시스템 (무엇을 성과로 볼지·톤)</span>
        <textarea
          className={styles.textarea}
          rows={7}
          value={system}
          placeholder={defaultSystem}
          onChange={(e) => setSystem(e.target.value)}
        />
      </div>
      <div className={styles.promptField}>
        <span className={styles.label}>추가 지침 (선택)</span>
        <textarea
          className={styles.textarea}
          rows={2}
          value={guide}
          placeholder="예: 성과 제목은 12자 이내로."
          onChange={(e) => setGuide(e.target.value)}
        />
      </div>
      <p className={styles.note}>
        JSON 출력 형식(제목·문제·접근·결과·기술·주제·근거)은 앱이 파싱하므로 고정이며 편집할 수
        없습니다. 비워 두면 기본값을 사용합니다.
      </p>

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
