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

// 제목 정규화(중복 판정용): 소문자화, 괄호·상태어·기호 제거.
function normKey(t: string): string {
  return t
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/(리뷰\s*중|진행\s*중|실무\s*완료|완료|머지|mr)/g, "")
    .replace(/[\s·,.\/\-_:()[\]]/g, "");
}
// 근거 날짜에서 대략 진행 분기 라벨(예: "2026 3분기", 걸치면 "2026 2분기~2026 3분기").
function quarterLabel(dates?: string[]): string | null {
  if (!dates || !dates.length) return null;
  const q = (d: string) => `${d.slice(0, 4)} ${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}분기`;
  const sorted = [...dates].sort();
  const a = q(sorted[0]!);
  const b = q(sorted[sorted.length - 1]!);
  return a === b ? a : `${a}~${b}`;
}
function detailScore(c: Candidate): number {
  return (c.problem ? 1 : 0) + (c.approach ? 1 : 0) + (c.result ? 1 : 0) + ((c.tech?.length ?? 0) > 0 ? 1 : 0);
}
// 월별로 쪼개 추출하면 장기 작업이 여러 달에 중복으로 나온다. 비슷한 제목을 하나로 병합한다.
function dedupeCandidates(cands: Candidate[]): Candidate[] {
  const kept: Candidate[] = [];
  for (const c of cands) {
    const k = normKey(c.title);
    const idx = kept.findIndex((x) => {
      const xk = normKey(x.title);
      return xk === k || (k.length >= 6 && (xk.includes(k) || k.includes(xk)));
    });
    if (idx === -1) {
      kept.push({ ...c, tech: [...(c.tech ?? [])], sourceDates: [...(c.sourceDates ?? [])] });
      continue;
    }
    const base = kept[idx]!;
    const better = detailScore(c) > detailScore(base) ? c : base;
    kept[idx] = {
      title: better.title,
      problem: better.problem,
      approach: better.approach,
      result: better.result,
      theme: better.theme ?? base.theme ?? c.theme,
      tech: [...new Set([...(base.tech ?? []), ...(c.tech ?? [])])],
      sourceDates: [...new Set([...(base.sourceDates ?? []), ...(c.sourceDates ?? [])])].sort(),
    };
  }
  return kept;
}

// [from, to] 를 분기 단위로 쪼갠다. 월보다 넓어, 한 요청 안에서 작업의 전체 흐름
// (분석→구현→리뷰)을 모델이 보고 하나로 합치게 한다. 진행률(n/m분기)도 보여준다.
function quartersBetween(from: string, to: string): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  let y = Number(from.slice(0, 4));
  let q = Math.floor((Number(from.slice(5, 7)) - 1) / 3); // 0~3
  const ty = Number(to.slice(0, 4));
  const tq = Math.floor((Number(to.slice(5, 7)) - 1) / 3);
  while (y < ty || (y === ty && q <= tq)) {
    const sm = q * 3 + 1; // 1,4,7,10
    const em = q * 3 + 3; // 3,6,9,12
    const start = `${y}-${pad(sm)}-01`;
    const end = `${y}-${pad(em)}-${pad(lastDayOfMonth(y, em))}`;
    out.push({ from: start < from ? from : start, to: end > to ? to : end });
    q++;
    if (q > 3) {
      q = 0;
      y++;
    }
  }
  return out;
}

// result 가 '진행 중/검토/리뷰 중' 같은 상태뿐이면 결과로 보지 않고 비운다.
const STATUS_ONLY = /^(진행\s*중|진행중|검토\s*중?|리뷰\s*중|리뷰중)$/;
function sanitizeCand(c: Candidate): Candidate {
  const result = c.result && STATUS_ONLY.test(c.result.trim()) ? undefined : c.result;
  return { ...c, result };
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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
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
    // 긴 기간은 월 단위로 쪼개 순차 추출 → 각 요청이 짧아 타임아웃을 피하고 진행률을 보여준다.
    const chunks = quartersBetween(from, to);
    setProgress({ done: 0, total: chunks.length });
    const all: Candidate[] = [];
    let failed = 0;
    let noKey = false;
    for (let i = 0; i < chunks.length; i++) {
      try {
        const res = await fetch("/api/achievements/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(chunks[i]),
        });
        const body = (await res.json().catch(() => ({}))) as {
          candidates?: Candidate[];
          error?: string;
        };
        if (res.ok) all.push(...(body.candidates ?? []).map(sanitizeCand));
        else if (body.error === "no_api_key") {
          noKey = true;
          break;
        } else failed++;
      } catch {
        failed++;
      }
      setProgress({ done: i + 1, total: chunks.length });
    }
    setProgress(null);
    setBusy(false);
    if (noKey) {
      setError("AI 키가 없어 추출할 수 없습니다. 직접 추가는 가능합니다.");
      return;
    }
    // 월별 중복 병합 + 이미 저장된 성과와 겹치는 후보 제외.
    const savedKeys = new Set(items.map((a) => normKey(a.title)));
    const unique = dedupeCandidates(all).filter((c) => !savedKeys.has(normKey(c.title)));
    setCandidates(unique);
    setPicked(new Set(unique.map((_, i) => i)));
    if (failed) setError(`${failed}개 구간 추출에 실패해 건너뛰었습니다. 다시 시도해 보세요.`);
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
          {busy
            ? progress
              ? `뽑는 중… ${progress.done}/${progress.total}분기`
              : "뽑는 중…"
            : "✨ 성과 뽑기"}
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
                  {quarterLabel(c.sourceDates) ? (
                    <span className={styles.period}>{quarterLabel(c.sourceDates)}</span>
                  ) : null}
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
                      {quarterLabel(a.sourceDates) ? (
                        <span className={styles.period}>{quarterLabel(a.sourceDates)}</span>
                      ) : null}
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
