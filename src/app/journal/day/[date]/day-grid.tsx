"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
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

type Prefill = { category: Category["id"]; tags: string[]; content: string };
type Editing =
  | { mode: "new"; start: string; end: string; prefill?: Prefill }
  | { mode: "edit"; entry: Entry }
  | null;

interface Group {
  startMin: number;
  entries: Entry[];
}

// 내용이 3줄을 넘을 법하면 "더보기"를 노출(대략적 기준 — 넘치지 않으면 클램프가 표가 안 남).
function likelyOverflows(content: string): boolean {
  return content.length > 90 || content.split("\n").length > 3;
}

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const layout = useMemo(() => computeDayLayout(entries, recordingHours), [entries, recordingHours]);

  // 겹침 묶음(clusterId)으로 그룹핑 → 시간 순서로 흐르는 행.
  const groups = useMemo<Group[]>(() => {
    const byCluster = new Map<number, Entry[]>();
    for (const it of layout.items) {
      const arr = byCluster.get(it.clusterId) ?? [];
      arr.push(it.entry);
      byCluster.set(it.clusterId, arr);
    }
    const gs = [...byCluster.values()].map((es) => {
      const sorted = [...es].sort((a, b) => (a.start < b.start ? -1 : 1));
      return { startMin: toMin(sorted[0]!.start), entries: sorted };
    });
    return gs.sort((a, b) => a.startMin - b.startMin);
  }, [layout]);

  // ── 저장/삭제 ────────────────────────────────────────────────────
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
    // 서버가 같은 내용 연속 기록을 합쳤을 수 있다. 흡수돼 삭제된 id 를 함께 받아 즉시 제거한다.
    const { entry, removed } = (await res.json()) as { entry: Entry; removed?: string[] };
    const drop = new Set(removed ?? []);
    setEntries((prev) => {
      const next = prev.filter((e) => !drop.has(e.id) && e.id !== entry.id);
      next.push(entry);
      return next.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    });
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

  // ── 열기/빠른 채우기 ────────────────────────────────────────────
  function openNew(atMin: number, prefill?: Prefill) {
    const s = Math.max(0, Math.min(1439, Math.round(atMin / 30) * 30));
    setEditing({ mode: "new", start: fromMin(s), end: fromMin(Math.min(s + 60, 1439)), prefill });
    setFormKey((k) => k + 1);
  }

  function openEdit(entry: Entry) {
    setEditing({ mode: "edit", entry });
    setFormKey((k) => k + 1);
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

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function defaultNewMin() {
    if (nowMinutes >= layout.startMin && nowMinutes < layout.endMin) return nowMinutes;
    return layout.startMin;
  }

  const formInitial: Partial<Entry> & { start: string; end: string } =
    editing?.mode === "edit"
      ? editing.entry
      : editing
        ? { start: editing.start, end: editing.end, ...editing.prefill }
        : { start: "", end: "" };

  // 카드 1장
  function card(entry: Entry, withActions: boolean) {
    const cat = catById.get(entry.category);
    const isOpen = expanded.has(entry.id);
    const showMore = Boolean(entry.content) && (isOpen || likelyOverflows(entry.content));
    return (
      <div
        className={styles.card}
        style={{ ["--cat" as string]: cat?.color }}
        role="button"
        tabIndex={0}
        onClick={() => openEdit(entry)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openEdit(entry);
          }
        }}
      >
        <div className={styles.chead}>
          <span className={styles.chip} style={{ ["--cat" as string]: cat?.color }}>
            {cat?.label ?? entry.category}
          </span>
          <span className={styles.ctime}>
            {entry.start}–{entry.end}
          </span>
          {withActions ? (
            <span className={styles.cact}>
              <button
                type="button"
                className={styles.miniBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  openEdit(entry);
                }}
              >
                수정
              </button>
              <button
                type="button"
                className={styles.miniBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(entry);
                }}
              >
                삭제
              </button>
            </span>
          ) : null}
        </div>
        {entry.content ? (
          <div className={`${styles.cbody} ${isOpen ? "" : styles.clamp}`}>{entry.content}</div>
        ) : null}
        {showMore ? (
          <button
            type="button"
            className={`${styles.more} ${isOpen ? styles.moreOpen : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(entry.id);
            }}
          >
            <svg className={styles.moreChev} viewBox="0 0 10 6" width="10" height="6" aria-hidden="true">
              <path
                d="M1 1l4 4 4-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {isOpen ? "접기" : "더보기"}
          </button>
        ) : null}
      </div>
    );
  }

  // 그룹(겹침 묶음) 1행
  function groupRow(g: Group) {
    return (
      <div key={`g-${g.entries[0]!.id}`} className={styles.trow}>
        <div className={styles.gut}>{fromMin(g.startMin)}</div>
        {g.entries.length === 1 ? (
          card(g.entries[0]!, true)
        ) : (
          <div className={styles.tcols}>{g.entries.map((e) => card(e, false))}</div>
        )}
      </div>
    );
  }

  // 현재 시각선을 그룹 사이에 끼워 넣는다.
  const showNow = nowMinutes >= layout.startMin && nowMinutes <= layout.endMin;
  const rows: ReactNode[] = [];
  let nowPlaced = false;
  for (const g of groups) {
    if (showNow && !nowPlaced && g.startMin > nowMinutes) {
      rows.push(nowRow(nowMinutes));
      nowPlaced = true;
    }
    rows.push(groupRow(g));
  }
  if (showNow && !nowPlaced) rows.push(nowRow(nowMinutes));

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
          {editing.mode === "new" && recent.length ? (
            <div className={styles.quick}>
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

      {layout.dawn ? (
        <FoldBar
          open={dawnOpen}
          onToggle={() => setDawnOpen((v) => !v)}
          label={`${fromMin(layout.dawn.from)}–${fromMin(layout.dawn.to)} · 새벽 · 기록 없음`}
          onAdd={() => openNew(layout.dawn!.to - 60)}
        />
      ) : null}

      <div className={styles.tlList}>
        {rows.length ? rows : <p className={styles.empty}>아직 기록이 없습니다. “+ 기록 추가”로 시작하세요.</p>}
      </div>

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

function nowRow(min: number) {
  return (
    <div key="now" className={styles.nowRow}>
      <span className={styles.nowLbl}>{fromMin(min)}</span>
      <span className={styles.nowLn} />
    </div>
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
      <button
        type="button"
        className={`${styles.fold} ${open ? styles.foldOpen : ""}`}
        onClick={onToggle}
      >
        <span className={styles.foldChev}>▸</span> {label}
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
