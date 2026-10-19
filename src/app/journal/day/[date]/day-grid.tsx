"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  computeDayLayout,
  fromMin,
  previousEntry,
  toMin,
  type LaidOutEntry,
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
  items: LaidOutEntry[];
}

// 겹친 묶음 안의 시간 칸(분). 15분 칸 × 18px ≈ 1시간 72px(1시간 카드 한 장이 들어가는 높이).
const SLOT = 15;
const SLOT_PX = 18;

// 겹친 묶음 안에서는 짧은 기록일수록 본문을 덜 보인다(1시간 이하 1줄, 2시간 이하 2줄).
function linesFor(minutes: number): number {
  return minutes <= 60 ? 1 : minutes <= 120 ? 2 : 3;
}

// 내용이 lines 줄을 넘을 법하면 "더보기"를 노출(대략적 기준 — 넘치지 않으면 클램프가 표가 안 남).
function likelyOverflows(content: string, lines = 3): boolean {
  return content.length > lines * 30 || content.split("\n").length > lines;
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
    const byCluster = new Map<number, LaidOutEntry[]>();
    for (const it of layout.items) {
      const arr = byCluster.get(it.clusterId) ?? [];
      arr.push(it);
      byCluster.set(it.clusterId, arr);
    }
    const gs = [...byCluster.values()].map((its) => {
      const sorted = [...its].sort((a, b) => a.top - b.top);
      return { startMin: sorted[0]!.top, items: sorted };
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

  // 테마 장식(마스킹테이프)은 그날 첫 기록에만 붙인다.
  const firstId = entries.reduce<Entry | null>((a, e) => (!a || e.start < a.start ? e : a), null)?.id;

  // 카드 1장
  function card(entry: Entry, withActions: boolean, place?: { gridRow: string; gridColumn: number; lines: number }) {
    const cat = catById.get(entry.category);
    const isOpen = expanded.has(entry.id);
    const lines = place?.lines ?? 3;
    const showMore = Boolean(entry.content) && (isOpen || likelyOverflows(entry.content, lines));
    return (
      <div
        key={entry.id}
        className={entry.id === firstId ? `${styles.card} tape-host` : styles.card}
        style={{
          ["--cat" as string]: cat?.color,
          ["--lines" as string]: lines,
          gridRow: place?.gridRow,
          gridColumn: place?.gridColumn,
        }}
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

  // 그룹 1행. 단독 기록은 내용 길이대로, 겹친 묶음은 그 안에서만 시간 비례로 그린다.
  function groupRow(g: Group) {
    const key = `g-${g.items[0]!.entry.id}`;
    if (g.items.length === 1) {
      return (
        <div key={key} className={styles.trow}>
          <div className={styles.gut}>{fromMin(g.startMin)}</div>
          {card(g.items[0]!.entry, true)}
        </div>
      );
    }
    const s0 = Math.floor(g.startMin / SLOT) * SLOT;
    const e0 = Math.ceil(Math.max(...g.items.map((it) => it.top + it.height)) / SLOT) * SLOT;
    const ncols = g.items[0]!.ncols;
    const row = (min: number) => Math.floor((min - s0) / SLOT) + 1;
    const hours: number[] = [];
    for (let m = Math.ceil((s0 + 1) / 60) * 60; m < e0; m += 60) hours.push(m);
    return (
      <div
        key={key}
        className={styles.cluster}
        style={{
          gridTemplateColumns: `46px repeat(${ncols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${(e0 - s0) / SLOT}, minmax(${SLOT_PX}px, auto))`,
        }}
      >
        <div className={styles.gut} style={{ gridRow: 1 }}>
          {fromMin(g.startMin)}
        </div>
        {hours.map((m) => (
          <div key={`l${m}`} className={styles.hourLine} style={{ gridRow: row(m) }} />
        ))}
        {hours.map((m) => (
          <div key={`h${m}`} className={`${styles.gut} ${styles.hourGut}`} style={{ gridRow: row(m) }}>
            {fromMin(m)}
          </div>
        ))}
        {g.items.map((it) =>
          card(it.entry, false, {
            gridRow: `${row(it.top)} / ${Math.max(row(it.top) + 1, Math.ceil((it.top + it.height - s0) / SLOT) + 1)}`,
            gridColumn: it.col + 2,
            lines: linesFor(it.height),
          }),
        )}
      </div>
    );
  }

  function emptyRow(h: number) {
    return (
      <div key={`empty-${h}`} className={styles.trow}>
        <div className={styles.gut}>{fromMin(h * 60)}</div>
        <button type="button" className={styles.emptySlot} onClick={() => openNew(h * 60)}>
          + 기록 추가
        </button>
      </div>
    );
  }

  // 시간 눈금 복원: 창(startMin~endMin) 안의 매 시각을 돌며, 그 시각에 시작하는 그룹은 카드로,
  // 아무 기록도 없는 빈 시각은 "+ 기록 추가" 행으로 보여준다. 여러 시간에 걸친 기록이 덮는
  // 시각은 그 카드가 대신하므로 빈 행을 넣지 않는다.
  const startHour = Math.floor(layout.startMin / 60);
  const endHour = Math.ceil(layout.endMin / 60);
  const groupsByHour = new Map<number, Group[]>();
  for (const g of groups) {
    const h = Math.floor(g.startMin / 60);
    const arr = groupsByHour.get(h);
    if (arr) arr.push(g);
    else groupsByHour.set(h, [g]);
  }
  const occupied = new Set<number>();
  for (const e of entries) {
    const sm = toMin(e.start);
    const em = Math.max(toMin(e.end), sm + 1);
    for (let h = Math.floor(sm / 60); h < Math.ceil(em / 60); h++) occupied.add(h);
  }

  const showNow = nowMinutes >= layout.startMin && nowMinutes <= layout.endMin;
  const nowHour = Math.floor(nowMinutes / 60);
  const rows: ReactNode[] = [];
  let nowPlaced = false;
  for (let h = startHour; h < endHour; h++) {
    if (showNow && !nowPlaced && nowHour === h) {
      rows.push(nowRow(nowMinutes));
      nowPlaced = true;
    }
    const gs = groupsByHour.get(h);
    if (gs && gs.length) for (const g of gs) rows.push(groupRow(g));
    else if (!occupied.has(h)) rows.push(emptyRow(h));
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
