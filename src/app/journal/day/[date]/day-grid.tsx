"use client";

import { useRouter } from "next/navigation";
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  computeDayLayout,
  fromMin,
  previousEntry,
  toMin,
  type RecentActivity,
} from "@/lib/timeline";
import type { Category, Entry, RecordingHours } from "@/lib/store/types";
import styles from "./day.module.css";

interface Props {
  date: string;
  initialEntries: Entry[];
  categories: Category[];
  recordingHours: RecordingHours;
  recent: RecentActivity[];
  nowMinutes: number; // 오늘이 아니면 -1
}

// 시간당 높이(px). 눈금 그라데이션(.tlTrack)과 반드시 일치시킨다.
const PX = 84;
const GAP = 6;
const MIN_CARD = 34;

type Prefill = { category: Category["id"]; tags: string[]; content: string };
type Editing =
  | { mode: "new"; start: string; end: string; prefill?: Prefill }
  | { mode: "edit"; entry: Entry }
  | null;

export function DayGrid({
  date,
  initialEntries,
  categories,
  recordingHours,
  recent,
  nowMinutes,
}: Props) {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [editing, setEditing] = useState<Editing>(null);
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dawnOpen, setDawnOpen] = useState(false);
  const [eveOpen, setEveOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const layout = useMemo(() => computeDayLayout(entries, recordingHours), [entries, recordingHours]);

  const trackH = ((layout.endMin - layout.startMin) / 60) * PX;
  const yOf = (min: number) => ((min - layout.startMin) / 60) * PX;
  const hourMarks: number[] = [];
  for (let m = layout.startMin; m <= layout.endMin; m += 60) hourMarks.push(m);

  // ── 저장/삭제 (기존 API 재사용) ──────────────────────────────────
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
    router.refresh();
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
    setEditing(null);
    router.refresh();
  }

  // ── 새 기록 열기 ────────────────────────────────────────────────
  function openNew(atMin: number, prefill?: Prefill) {
    const s = Math.max(0, Math.min(1439, Math.round(atMin / 30) * 30));
    setEditing({ mode: "new", start: fromMin(s), end: fromMin(Math.min(s + 60, 1439)), prefill });
    setFormKey((k) => k + 1);
    setExpanded(null);
  }

  function openEdit(entry: Entry) {
    setEditing({ mode: "edit", entry });
    setFormKey((k) => k + 1);
    setExpanded(null);
  }

  function applyChip(a: RecentActivity) {
    setEditing((ed) =>
      ed && ed.mode === "new"
        ? { ...ed, prefill: { category: a.category, tags: a.tags, content: a.content } }
        : ed,
    );
    setFormKey((k) => k + 1);
  }

  function sameAsPrev() {
    if (!editing || editing.mode !== "new") return;
    const prev = previousEntry(entries, toMin(editing.start));
    if (!prev) return;
    applyChip({ category: prev.category, tags: prev.tags, content: prev.content });
  }

  function onTrackClick(e: ReactMouseEvent<HTMLDivElement>) {
    if (e.target !== trackRef.current) return; // 카드가 아니라 빈 바탕을 눌렀을 때만
    const rect = trackRef.current.getBoundingClientRect();
    const min = layout.startMin + ((e.clientY - rect.top) / PX) * 60;
    openNew(min);
  }

  function defaultNewMin() {
    if (nowMinutes >= layout.startMin && nowMinutes < layout.endMin) return nowMinutes;
    return layout.startMin;
  }

  // 편집 폼 초기값
  const formInitial: Partial<Entry> & { start: string; end: string } =
    editing?.mode === "edit"
      ? editing.entry
      : editing
        ? { start: editing.start, end: editing.end, ...editing.prefill }
        : { start: "", end: "" };

  return (
    <>
      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.tlToolbar}>
        <button type="button" className={styles.addBtn} onClick={() => openNew(defaultNewMin())}>
          + 기록 추가
        </button>
      </div>

      {editing ? (
        <div className={styles.panel}>
          {editing.mode === "new" ? (
            <div className={styles.quick}>
              {recent.length ? (
                <>
                  <span className={styles.quickLabel}>빠르게 반복</span>
                  <div className={styles.chips}>
                    {recent.map((a, i) => (
                      <button
                        key={`${a.category}-${i}`}
                        type="button"
                        className={styles.reChip}
                        style={{ ["--cat" as string]: catById.get(a.category)?.color }}
                        onClick={() => applyChip(a)}
                      >
                        <span className={styles.dot} />
                        {catById.get(a.category)?.label ?? a.category} · {a.content}
                      </button>
                    ))}
                    {previousEntry(entries, toMin(editing.start)) ? (
                      <button type="button" className={styles.reChip} onClick={sameAsPrev}>
                        ↑ 직전과 동일
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
          <EntryForm
            key={formKey}
            categories={categories}
            initial={formInitial}
            onCancel={() => setEditing(null)}
            onSave={save}
            onDelete={editing.mode === "edit" ? () => remove(editing.entry) : undefined}
          />
        </div>
      ) : null}

      {/* 접힌 새벽 */}
      {layout.dawn ? (
        <FoldBar
          open={dawnOpen}
          onToggle={() => setDawnOpen((v) => !v)}
          label={`${fromMin(layout.dawn.from)}–${fromMin(layout.dawn.to)} · 새벽 · 기록 없음`}
          onAdd={() => openNew(layout.dawn!.to - 60)}
        />
      ) : null}

      {/* 타임라인 */}
      <div className={styles.tl} style={{ height: trackH }}>
        {hourMarks.map((m) => (
          <div key={m} className={styles.hr} style={{ top: yOf(m) - 6 }}>
            {fromMin(m)}
          </div>
        ))}
        <div
          className={styles.tlTrack}
          ref={trackRef}
          onClick={onTrackClick}
          role="presentation"
        >
          {nowMinutes >= layout.startMin && nowMinutes < layout.endMin ? (
            <div className={styles.nowline} style={{ top: yOf(nowMinutes) }}>
              <span>{fromMin(nowMinutes)}</span>
            </div>
          ) : null}

          {layout.items
            .filter((it) => !it.overflow)
            .map((it) => {
              const cat = catById.get(it.entry.category);
              const top = yOf(it.top) + GAP / 2;
              const height = Math.max(yOf(it.top + it.height) - yOf(it.top) - GAP, MIN_CARD);
              const single = it.ncols <= 1;
              const style: CSSProperties = { top, height, ["--cat" as string]: cat?.color };
              if (single) {
                style.left = 4;
                style.right = 4;
              } else {
                const vis = Math.min(it.ncols, 3);
                const M = 2;
                const G = 2;
                const w = (100 - 2 * M - (vis - 1) * G) / vis;
                style.left = `${M + it.col * (w + G)}%`;
                style.width = `${w}%`;
              }
              return (
                <button
                  key={it.entry.id}
                  type="button"
                  className={`${styles.ev} ${single ? "" : styles.col}`}
                  style={style}
                  onClick={() => openEdit(it.entry)}
                >
                  <span className={styles.evHead}>
                    <span className={styles.chip} style={{ ["--cat" as string]: cat?.color }}>
                      {cat?.label ?? it.entry.category}
                    </span>
                    <span className={styles.etime}>
                      {it.entry.start}–{it.entry.end}
                    </span>
                  </span>
                  {it.entry.content ? (
                    <span className={styles.evBody}>{it.entry.content}</span>
                  ) : null}
                </button>
              );
            })}

          {/* 4개 이상 겹침: •••+N 배지 / 펼침 목록 */}
          {layout.clusters
            .filter((c) => c.overflowCount > 0)
            .map((c) =>
              expanded === c.id ? (
                <div
                  key={`exp-${c.id}`}
                  className={styles.expand}
                  style={{ top: yOf(c.top) + GAP / 2 }}
                >
                  {c.entries.map((e) => {
                    const cat = catById.get(e.category);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        className={styles.exItem}
                        style={{ ["--cat" as string]: cat?.color }}
                        onClick={() => openEdit(e)}
                      >
                        <span className={styles.chip} style={{ ["--cat" as string]: cat?.color }}>
                          {cat?.label ?? e.category}
                        </span>
                        <span className={styles.etime}>
                          {e.start}–{e.end}
                          {e.content ? ` · ${e.content}` : ""}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className={styles.lessPill}
                    onClick={() => setExpanded(null)}
                  >
                    접기
                  </button>
                </div>
              ) : (
                <button
                  key={`more-${c.id}`}
                  type="button"
                  className={styles.moreBadge}
                  style={{ top: yOf(c.top) + GAP / 2 - 11 }}
                  onClick={() => setExpanded(c.id)}
                >
                  •••<span>+{c.overflowCount}</span>
                </button>
              ),
            )}
        </div>
      </div>

      {/* 접힌 저녁·밤 */}
      {layout.eve ? (
        <FoldBar
          open={eveOpen}
          onToggle={() => setEveOpen((v) => !v)}
          label={`${fromMin(layout.eve.from)}–24:00 · 저녁·밤 · 기록 없음`}
          onAdd={() => openNew(layout.eve!.from)}
        />
      ) : null}
    </>
  );
}

function FoldBar({
  open,
  onToggle,
  label,
  onAdd,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  onAdd: () => void;
}) {
  return (
    <div className={styles.foldWrap}>
      <button type="button" className={`${styles.fold} ${open ? styles.foldOpen : ""}`} onClick={onToggle}>
        <span className={styles.chev}>▸</span> {label}
      </button>
      {open ? (
        <div className={styles.foldBody}>
          비어 있어 접어 뒀습니다.{" "}
          <button type="button" className={styles.miniBtn} onClick={onAdd}>
            이 구간에 기록 추가
          </button>
        </div>
      ) : null}
    </div>
  );
}

function EntryForm({
  categories,
  initial,
  onCancel,
  onSave,
  onDelete,
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
  onDelete?: () => void;
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
        {onDelete ? (
          <button type="button" className={styles.danger} onClick={onDelete} disabled={busy}>
            삭제
          </button>
        ) : null}
        <span className={styles.spacer} />
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
