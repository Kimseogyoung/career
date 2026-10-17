"use client";

import { useState, type FormEvent } from "react";
import type { Project } from "@/lib/store/types";
import styles from "../career.module.css";

type Editing = { mode: "new" } | { mode: "edit"; p: Project } | null;

interface Input {
  name: string;
  period?: string;
  description?: string;
}

export function ProjectsBoard({ initial }: { initial: Project[] }) {
  const [items, setItems] = useState<Project[]>(initial);
  const [editing, setEditing] = useState<Editing>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(input: Input) {
    setBusy(true);
    setError(null);
    try {
      if (editing?.mode === "edit") {
        const res = await fetch(`/api/projects/${editing.p.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const body = (await res.json().catch(() => ({}))) as { project?: Project };
        if (!res.ok || !body.project) {
          setError("저장에 실패했습니다.");
          return;
        }
        setItems((prev) => prev.map((x) => (x.id === body.project!.id ? body.project! : x)));
      } else {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const body = (await res.json().catch(() => ({}))) as { project?: Project };
        if (!res.ok || !body.project) {
          setError("저장에 실패했습니다.");
          return;
        }
        setItems((prev) => [...prev, body.project!]);
      }
      setEditing(null);
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: Project) {
    if (!confirm(`'${p.name}' 프로젝트를 삭제할까요? (연결된 성과는 '미지정'으로 남습니다)`)) return;
    setItems((prev) => prev.filter((x) => x.id !== p.id));
    await fetch(`/api/projects/${p.id}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <div className={styles.sec}>
      <div className={styles.secHead}>
        <h2>프로젝트</h2>
        <span className={styles.n}>{items.length}개</span>
        <span className={styles.headRight}>
          {!editing ? (
            <button type="button" className={styles.addBtn} onClick={() => setEditing({ mode: "new" })}>
              + 새 프로젝트
            </button>
          ) : null}
        </span>
      </div>

      {editing ? (
        <ProjectForm
          initial={editing.mode === "edit" ? editing.p : undefined}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      {items.length === 0 && !editing ? (
        <p className={styles.empty}>아직 프로젝트가 없습니다. “새 프로젝트”로 추가하세요.</p>
      ) : (
        <ul className={styles.list}>
          {items.map((p) => (
            <li key={p.id} className={styles.item}>
              <div className={styles.ibody}>
                <div className={styles.ihead}>
                  <span className={styles.itemTitle}>{p.name}</span>
                  {p.period ? <span className={styles.period}>{p.period}</span> : null}
                </div>
                {p.description ? <div className={styles.pdesc}>{p.description}</div> : null}
                <div className={styles.imeta}>
                  <span className={styles.iacts}>
                    <button
                      type="button"
                      className={styles.mini}
                      onClick={() => setEditing({ mode: "edit", p })}
                    >
                      수정
                    </button>
                    <button type="button" className={styles.mini} onClick={() => remove(p)}>
                      삭제
                    </button>
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectForm({
  initial,
  busy,
  onCancel,
  onSave,
}: {
  initial?: Project;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: Input) => void | Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [period, setPeriod] = useState(initial?.period ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    void onSave({ name, period, description });
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <input
        className={styles.fTitle}
        placeholder="프로젝트명 (필수)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <input
        className={styles.fTech}
        placeholder="기간 (예: 2025 – 현재)"
        value={period}
        onChange={(e) => setPeriod(e.target.value)}
      />
      <textarea
        className={styles.fArea}
        rows={2}
        placeholder="한 줄 소개 (선택)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className={styles.formActions}>
        <button type="button" className={styles.ghost} onClick={onCancel} disabled={busy}>
          취소
        </button>
        <button type="submit" className={styles.saveBtn} disabled={busy || !name.trim()}>
          {busy ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}
