"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { Achievement } from "@/lib/store/types";
import styles from "./career.module.css";

const THEMES = [
  "아키텍처",
  "콘텐츠·기능",
  "성능·DB",
  "통신·네트워크",
  "운영·모니터링",
  "인프라·배포",
  "보안·어뷰징",
  "협업",
];

interface Candidate {
  title: string;
  problem?: string;
  approach?: string;
  result?: string;
  tech?: string[];
  theme?: string;
  sourceDates?: string[];
}

type Range = "this" | "last" | "custom";
type Editing = { mode: "new" } | { mode: "edit"; a: Achievement } | null;

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function lastDayOfMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1-12
}

function hasDetail(a: {
  problem?: string;
  approach?: string;
  result?: string;
  tech?: string[];
}) {
  return Boolean(a.problem || a.approach || a.result || (a.tech && a.tech.length));
}

export function CareerBoard({
  initial,
  canGenerate,
  today,
}: {
  initial: Achievement[];
  canGenerate: boolean;
  today: string; // YYYY-MM-DD (KST)
}) {
  const [items, setItems] = useState<Achievement[]>(initial);
  const [range, setRange] = useState<Range>("this");
  const [from, setFrom] = useState(today.slice(0, 7) + "-01");
  const [to, setTo] = useState(today);
  const [starOnly, setStarOnly] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Editing>(null);

  // 범위 → from/to
  function applyRange(r: Range) {
    setRange(r);
    const [y, m] = today.split("-").map(Number);
    if (r === "this") {
      setFrom(`${y}-${pad(m!)}-01`);
      setTo(today);
    } else if (r === "last") {
      const py = m === 1 ? y! - 1 : y!;
      const pm = m === 1 ? 12 : m! - 1;
      setFrom(`${py}-${pad(pm)}-01`);
      setTo(`${py}-${pad(pm)}-${pad(lastDayOfMonth(py, pm))}`);
    }
  }

  async function runExtract() {
    setBusy(true);
    setError(null);
    setCandidates(null);
    try {
      const res = await fetch("/api/achievements/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        candidates?: Candidate[];
        error?: string;
      };
      if (!res.ok) {
        setError(
          body.error === "no_api_key"
            ? "AI 키가 없어 추출할 수 없습니다. 직접 추가는 가능합니다."
            : "성과 추출에 실패했습니다.",
        );
        return;
      }
      const cands = body.candidates ?? [];
      setCandidates(cands);
      setPicked(new Set(cands.map((_, i) => i)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveSelected() {
    if (!candidates) return;
    const chosen = candidates.filter((_, i) => picked.has(i));
    if (!chosen.length) {
      setCandidates(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/achievements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: chosen }),
      });
      const body = (await res.json().catch(() => ({}))) as { saved?: Achievement[] };
      if (!res.ok) {
        setError("저장에 실패했습니다.");
        return;
      }
      setItems((prev) => [...(body.saved ?? []), ...prev]);
      setCandidates(null);
    } finally {
      setBusy(false);
    }
  }

  async function toggleStar(a: Achievement) {
    const next = !a.star;
    setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, star: next } : x)));
    await fetch(`/api/achievements/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ star: next }),
    }).catch(() => {});
  }

  async function remove(a: Achievement) {
    if (!confirm("이 성과를 삭제할까요?")) return;
    setItems((prev) => prev.filter((x) => x.id !== a.id));
    await fetch(`/api/achievements/${a.id}`, { method: "DELETE" }).catch(() => {});
  }

  async function saveEdit(input: Omit<Candidate, "sourceDates">) {
    setBusy(true);
    setError(null);
    try {
      if (editing?.mode === "edit") {
        const res = await fetch(`/api/achievements/${editing.a.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const body = (await res.json().catch(() => ({}))) as { achievement?: Achievement };
        if (!res.ok || !body.achievement) {
          setError("저장에 실패했습니다.");
          return;
        }
        setItems((prev) => prev.map((x) => (x.id === body.achievement!.id ? body.achievement! : x)));
      } else {
        const res = await fetch("/api/achievements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: [{ ...input, createdBy: "manual" }] }),
        });
        const body = (await res.json().catch(() => ({}))) as { saved?: Achievement[] };
        if (!res.ok) {
          setError("저장에 실패했습니다.");
          return;
        }
        setItems((prev) => [...(body.saved ?? []), ...prev]);
      }
      setEditing(null);
    } finally {
      setBusy(false);
    }
  }

  const shown = useMemo(
    () => (starOnly ? items.filter((a) => a.star) : items),
    [items, starOnly],
  );
  const starCount = items.filter((a) => a.star).length;

  return (
    <>
      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.toolbar}>
        <div className={styles.seg} role="group" aria-label="범위">
          <button type="button" data-on={range === "this"} onClick={() => applyRange("this")}>
            이번 달
          </button>
          <button type="button" data-on={range === "last"} onClick={() => applyRange("last")}>
            지난 달
          </button>
          <button type="button" data-on={range === "custom"} onClick={() => setRange("custom")}>
            기간 지정
          </button>
        </div>
        {range === "custom" ? (
          <div className={styles.rangeInputs}>
            <input
              className={styles.date}
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="시작일"
            />
            <span className={styles.dash}>–</span>
            <input
              className={styles.date}
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="종료일"
            />
          </div>
        ) : null}
        <button
          type="button"
          className={styles.starFilter}
          data-on={starOnly}
          onClick={() => setStarOnly((v) => !v)}
        >
          ⭐ 후보만
        </button>
        <button
          type="button"
          className={styles.pull}
          onClick={runExtract}
          disabled={busy || !canGenerate}
          title={canGenerate ? "" : "AI 키가 없어 비활성"}
        >
          {busy ? "뽑는 중…" : "✨ 성과 뽑기"}
        </button>
      </div>

      {/* 추출 후보 */}
      {candidates ? (
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <b>뽑은 성과 후보</b>
            <span className={styles.sub}>
              {candidates.length ? "담을 것을 고르세요" : "성과로 뽑을 만한 기록이 없습니다"} ·{" "}
              {candidates.length}건
            </span>
          </div>
          {candidates.map((c, i) => (
            <label key={i} className={styles.cand}>
              <input
                type="checkbox"
                checked={picked.has(i)}
                onChange={(e) =>
                  setPicked((prev) => {
                    const n = new Set(prev);
                    if (e.target.checked) n.add(i);
                    else n.delete(i);
                    return n;
                  })
                }
              />
              <span className={styles.candBody}>
                <span className={styles.candText}>{c.title}</span>
                <span className={styles.candMeta}>
                  <span className={`${styles.kind} ${hasDetail(c) ? styles.detailK : styles.briefK}`}>
                    {hasDetail(c) ? "상세 추출" : "요약"}
                  </span>
                  {c.theme ? <span className={styles.topic}>{c.theme}</span> : null}
                  {c.sourceDates?.length ? <span>근거 {c.sourceDates.length}건</span> : null}
                </span>
              </span>
            </label>
          ))}
          <div className={styles.panelFoot}>
            <button type="button" className={styles.ghost} onClick={() => setCandidates(null)}>
              닫기
            </button>
            <button type="button" className={styles.saveBtn} onClick={saveSelected} disabled={busy}>
              선택 {picked.size}건 저장
            </button>
          </div>
        </div>
      ) : null}

      {/* 편집/추가 */}
      {editing ? (
        <AchievementForm
          initial={editing.mode === "edit" ? editing.a : undefined}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={saveEdit}
        />
      ) : null}

      {/* 저장된 성과 */}
      <div className={styles.sec}>
        <div className={styles.secHead}>
          <h2>저장된 성과</h2>
          <span className={styles.n}>
            {items.length}건{starCount ? ` · ⭐ ${starCount}` : ""}
          </span>
          {!editing ? (
            <button
              type="button"
              className={styles.addBtn}
              onClick={() => setEditing({ mode: "new" })}
            >
              + 직접 추가
            </button>
          ) : null}
        </div>

        {shown.length === 0 ? (
          <p className={styles.empty}>
            아직 성과가 없습니다. “성과 뽑기”로 기록에서 뽑거나 “직접 추가”로 적으세요.
          </p>
        ) : (
          <ul className={styles.list}>
            {shown.map((a) => {
              const detail = hasDetail(a);
              const open = expanded.has(a.id);
              return (
                <li key={a.id} className={`${styles.item} ${open ? styles.open : ""}`}>
                  <button
                    type="button"
                    className={styles.starBtn}
                    data-on={a.star}
                    aria-label="후보"
                    onClick={() => toggleStar(a)}
                  >
                    {a.star ? "★" : "☆"}
                  </button>
                  <div className={styles.ibody}>
                    <div className={styles.ihead}>
                      <span className={styles.itemTitle}>{a.title}</span>
                      {detail ? <span className={styles.badge}>심화</span> : null}
                    </div>
                    {detail && open ? (
                      <div className={styles.detail}>
                        {a.problem ? (
                          <div className={styles.drow}>
                            <span className={styles.dlbl}>문제</span>
                            <span>{a.problem}</span>
                          </div>
                        ) : null}
                        {a.approach ? (
                          <div className={styles.drow}>
                            <span className={styles.dlbl}>접근</span>
                            <span>{a.approach}</span>
                          </div>
                        ) : null}
                        {a.result ? (
                          <div className={styles.drow}>
                            <span className={styles.dlbl}>결과</span>
                            <span>{a.result}</span>
                          </div>
                        ) : null}
                        {a.tech.length ? (
                          <div className={styles.techs}>
                            {a.tech.map((t) => (
                              <span key={t} className={styles.tech}>
                                {t}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <div className={styles.imeta}>
                      {a.theme ? <span className={styles.topic}>{a.theme}</span> : null}
                      {a.sourceDates.length ? (
                        <span className={styles.srcs}>근거 {a.sourceDates.length}건</span>
                      ) : null}
                      {detail ? (
                        <button
                          type="button"
                          className={styles.more2}
                          onClick={() =>
                            setExpanded((prev) => {
                              const n = new Set(prev);
                              if (n.has(a.id)) n.delete(a.id);
                              else n.add(a.id);
                              return n;
                            })
                          }
                        >
                          {open ? "접기 ▴" : "자세히 ▾"}
                        </button>
                      ) : null}
                      <span className={styles.iacts}>
                        <button
                          type="button"
                          className={styles.mini}
                          onClick={() => setEditing({ mode: "edit", a })}
                        >
                          수정
                        </button>
                        <button type="button" className={styles.mini} onClick={() => remove(a)}>
                          삭제
                        </button>
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function AchievementForm({
  initial,
  busy,
  onCancel,
  onSave,
}: {
  initial?: Achievement;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: {
    title: string;
    problem?: string;
    approach?: string;
    result?: string;
    tech?: string[];
    theme?: string;
  }) => void | Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [problem, setProblem] = useState(initial?.problem ?? "");
  const [approach, setApproach] = useState(initial?.approach ?? "");
  const [result, setResult] = useState(initial?.result ?? "");
  const [theme, setTheme] = useState(initial?.theme ?? "");
  const [tech, setTech] = useState((initial?.tech ?? []).join(", "));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    void onSave({
      title,
      problem,
      approach,
      result,
      theme,
      tech: tech
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <input
        className={styles.fTitle}
        placeholder="성과 한 줄 요약 (필수)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      <div className={styles.fhint}>상세는 뽑아낼 수 있을 때만 — 없으면 비워 두세요.</div>
      <textarea
        className={styles.fArea}
        rows={2}
        placeholder="문제 / 상황 (선택)"
        value={problem}
        onChange={(e) => setProblem(e.target.value)}
      />
      <textarea
        className={styles.fArea}
        rows={2}
        placeholder="접근 · 방법 — 어떤 기술을 왜 (선택)"
        value={approach}
        onChange={(e) => setApproach(e.target.value)}
      />
      <textarea
        className={styles.fArea}
        rows={2}
        placeholder="결과 · 효과, 수치 (선택)"
        value={result}
        onChange={(e) => setResult(e.target.value)}
      />
      <div className={styles.frow}>
        <select className={styles.fSelect} value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="">주제 없음</option>
          {theme && !THEMES.includes(theme) ? <option value={theme}>{theme}</option> : null}
          {THEMES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          className={styles.fTech}
          placeholder="사용 기술 (쉼표: Redis, MySQL)"
          value={tech}
          onChange={(e) => setTech(e.target.value)}
        />
      </div>
      <div className={styles.formActions}>
        <button type="button" className={styles.ghost} onClick={onCancel} disabled={busy}>
          취소
        </button>
        <button type="submit" className={styles.saveBtn} disabled={busy || !title.trim()}>
          {busy ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}
