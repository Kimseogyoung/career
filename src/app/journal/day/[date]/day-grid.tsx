"use client";

import { useMemo, useState, type FormEvent } from "react";
import { buildSlots } from "@/lib/slots";
import type { Category, Entry, RecordingHours } from "@/lib/store/types";
import styles from "./day.module.css";

interface Props {
  date: string;
  initialEntries: Entry[];
  categories: Category[];
  recordingHours: RecordingHours;
}

// 폼이 열린 상태: 새 엔트리(해당 슬롯 start 프리필) 또는 기존 엔트리 편집.
type Editing = { mode: "new"; start: string; end: string } | { mode: "edit"; entry: Entry } | null;

export function DayGrid({ date, initialEntries, categories, recordingHours }: Props) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [editing, setEditing] = useState<Editing>(null);
  const [error, setError] = useState<string | null>(null);

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const slots = useMemo(() => buildSlots(recordingHours, entries), [recordingHours, entries]);

  function replaceEntry(next: Entry) {
    setEntries((prev) => {
      const i = prev.findIndex((e) => e.id === next.id);
      const copy = i >= 0 ? prev.map((e) => (e.id === next.id ? next : e)) : [...prev, next];
      return copy.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    });
  }

  async function save(input: {
    start: string;
    end: string;
    category: string;
    tags: string[];
    content: string;
  }) {
    setError(null);
    const isEdit = editing?.mode === "edit";
    const url = isEdit
      ? `/api/journal/${date}/entries/${editing.entry.id}`
      : `/api/journal/${date}/entries`;
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      setError(body.message ?? body.error ?? "저장에 실패했습니다.");
      return;
    }
    const { entry } = (await res.json()) as { entry: Entry };
    replaceEntry(entry);
    setEditing(null);
  }

  async function remove(entry: Entry) {
    if (!confirm("이 기록을 삭제할까요?")) return;
    setError(null);
    const res = await fetch(`/api/journal/${date}/entries/${entry.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("삭제에 실패했습니다.");
      return;
    }
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
  }

  return (
    <>
      {error ? <p className={styles.error}>{error}</p> : null}

      {slots.map((slot) => (
        <div key={slot.start} className={styles.slot}>
          <div className={styles.slotTime}>{slot.start}</div>
          <div className={styles.slotBody}>
            {slot.entries.map((entry) =>
              editing?.mode === "edit" && editing.entry.id === entry.id ? (
                <EntryForm
                  key={entry.id}
                  categories={categories}
                  initial={entry}
                  onCancel={() => setEditing(null)}
                  onSave={save}
                />
              ) : (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  category={catById.get(entry.category)}
                  onEdit={() => setEditing({ mode: "edit", entry })}
                  onDelete={() => remove(entry)}
                />
              ),
            )}

            {editing?.mode === "new" && editing.start === slot.start ? (
              <EntryForm
                categories={categories}
                initial={{ start: slot.start, end: slot.end }}
                onCancel={() => setEditing(null)}
                onSave={save}
              />
            ) : (
              <button
                type="button"
                className={styles.addBtn}
                onClick={() => setEditing({ mode: "new", start: slot.start, end: slot.end })}
              >
                + 기록 추가
              </button>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

function EntryCard({
  entry,
  category,
  onEdit,
  onDelete,
}: {
  entry: Entry;
  category: Category | undefined;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={styles.entry} style={{ ["--cat" as string]: category?.color }}>
      <div className={styles.entryHead}>
        <span className={styles.catChip} style={{ ["--cat" as string]: category?.color }}>
          {category?.label ?? entry.category}
        </span>
        <span className={styles.slotTime}>
          {entry.start}–{entry.end}
        </span>
        {entry.tags.map((t) => (
          <span key={t} className={styles.tag}>
            #{t}
          </span>
        ))}
      </div>
      {entry.content ? <div className={styles.entryContent}>{entry.content}</div> : null}
      <div className={styles.entryActions}>
        <button type="button" className={styles.miniBtn} onClick={onEdit}>
          수정
        </button>
        <button type="button" className={styles.miniBtn} onClick={onDelete}>
          삭제
        </button>
      </div>
    </div>
  );
}

function EntryForm({
  categories,
  initial,
  onCancel,
  onSave,
}: {
  categories: Category[];
  initial: Partial<Entry> & { start: string; end: string };
  onCancel: () => void;
  onSave: (input: {
    start: string;
    end: string;
    category: string;
    tags: string[];
    content: string;
  }) => void | Promise<void>;
}) {
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [category, setCategory] = useState<string>(initial.category ?? categories[0]?.id ?? "work");
  const [tags, setTags] = useState((initial.tags ?? []).join(", "));
  const [content, setContent] = useState(initial.content ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await onSave({
      start,
      end,
      category,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      content,
    });
    setBusy(false);
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.row}>
        {/* 시작·끝 시간은 한 묶음으로 묶어 좁은 화면에서도 같은 줄에 유지한다. */}
        <div className={styles.timeRange}>
          <input
            className={`${styles.input} ${styles.timeInput}`}
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
          />
          <span className={styles.slotTime}>–</span>
          <input
            className={`${styles.input} ${styles.timeInput}`}
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            required
          />
        </div>
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
      </div>
      <input
        className={`${styles.input} ${styles.grow}`}
        placeholder="태그 (쉼표로 구분: career-log, nextjs)"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
      />
      <textarea
        className={styles.textarea}
        placeholder="무엇을 했는지"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        autoFocus
      />
      <div className={styles.formActions}>
        <button type="button" className={styles.cancel} onClick={onCancel} disabled={busy}>
          취소
        </button>
        <button type="submit" className={styles.save} disabled={busy}>
          {busy ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}
