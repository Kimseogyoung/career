"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Category } from "@/lib/store/types";
import { formatKoreanDate } from "@/lib/time";
import styles from "./quick.module.css";

// slot 파라미터 "YYYY-MM-DDTHH" 를 파싱해 그 한 시간 슬롯만 기록한다.
function parseSlot(slot: string | null): { date: string; hour: number } | null {
  if (!slot) return null;
  const m = slot.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})$/);
  if (!m) return null;
  return { date: m[1]!, hour: Number(m[2]) };
}

export function QuickEntry({ categories }: { categories: Category[] }) {
  const params = useSearchParams();
  const slot = parseSlot(params.get("slot"));

  const [category, setCategory] = useState<string>(categories[0]?.id ?? "work");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!slot) {
    return (
      <div className={styles.card}>
        <p className={styles.error}>잘못된 접근입니다. (slot 파라미터 없음)</p>
        <Link className={styles.btn} href="/">
          달력으로
        </Link>
      </div>
    );
  }

  const hh = String(slot.hour).padStart(2, "0");
  const endHh = String(Math.min(slot.hour + 1, 23)).padStart(2, "0");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!slot) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/journal/${slot.date}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: `${hh}:00`,
          end: `${endHh}:00`,
          category,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          content,
        }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        setError(b.message ?? b.error ?? "저장에 실패했습니다.");
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className={styles.card}>
        <div className={styles.done}>
          <p>✓ 기록했습니다</p>
          <div className={styles.doneActions}>
            <Link className={styles.btn} href={`/journal/day/${slot.date}`}>
              이 날 보기
            </Link>
            <Link className={styles.btn} href="/">
              달력
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form className={styles.card} onSubmit={submit}>
      <p className={styles.slot}>
        {formatKoreanDate(slot.date)}{" "}
        <b>
          {hh}:00–{endHh}:00
        </b>
      </p>
      <div className={styles.row}>
        <select
          className={styles.select}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          className={`${styles.input} ${styles.grow}`}
          placeholder="태그 (쉼표)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </div>
      <textarea
        className={styles.textarea}
        placeholder="무엇을 했는지"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        autoFocus
      />
      <button
        className={styles.submit}
        type="submit"
        disabled={busy || content.trim().length === 0}
      >
        {busy ? "저장 중…" : "기록"}
      </button>
      {error ? <p className={styles.error}>{error}</p> : null}
    </form>
  );
}
