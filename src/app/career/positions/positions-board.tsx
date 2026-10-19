"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { DUTY_GROUPS, DUTY_MAX, dutyName } from "@/lib/positions/duties";
import type { PositionMark } from "@/lib/store/types";
import type { BoardData, PositionRow } from "./types";
import styles from "./positions.module.css";

// 추천 포지션 표(시안 B): 촘촘한 표 + 행을 누르면 근거·부족이 아래로 펼쳐진다.

type Sort = "score" | "deadline" | "recent";
type View = "all" | "new" | "star" | "hidden";

const VERDICT: Record<PositionRow["careerVerdict"], { mark: string; cls: string; title: string }> = {
  ok: { mark: "✓", cls: "ok", title: "경력 조건 충족" },
  any: { mark: "✓", cls: "ok", title: "경력 무관" },
  over: { mark: "△", cls: "warn", title: "요구 경력보다 많음" },
  near: { mark: "△", cls: "warn", title: "요구 경력에 1년 이내로 모자람" },
  under: { mark: "✕", cls: "no", title: "요구 경력에 모자람" },
  newOnly: { mark: "✕", cls: "no", title: "신입 대상" },
  unknown: { mark: "", cls: "", title: "내 경력이 비어 있어 판단 못 함(내 정보 → 경력)" },
};

const UNCERTAIN: Record<NonNullable<PositionRow["uncertain"]>, string> = {
  image: "본문이 이미지라 기술을 판단하지 못했습니다(경력만 반영).",
  noDetail: "아직 본문을 받지 못했습니다. 다음 수집 때 반영됩니다.",
  noTech: "본문에서 기술 이름을 찾지 못했습니다.",
};

function scoreCls(n: number): string | undefined {
  return n >= 75 ? styles.hi : n >= 55 ? styles.mid : styles.lo;
}

function deadlineText(d: PositionRow["deadline"]): { text: string; soon: boolean } {
  if (d.days === undefined) return { text: d.label, soon: false };
  if (d.days < 0) return { text: "마감", soon: false };
  return { text: d.days === 0 ? "오늘" : `D-${d.days}`, soon: d.days <= 3 };
}

function runText(r: BoardData["lastRun"]): string {
  if (!r) return "아직 수집 전";
  // KST "10.19 09:10"
  const k = new Date(Date.parse(r.at) + 9 * 3600_000).toISOString();
  const t = `${k.slice(5, 7)}.${k.slice(8, 10)} ${k.slice(11, 16)}`;
  return r.ok ? `${t} 수집` : `${t} 수집 중단(${r.error ?? "오류"})`;
}

function sortRows(rows: PositionRow[], sort: Sort): PositionRow[] {
  const by = [...rows];
  if (sort === "score") by.sort((a, b) => b.score - a.score || Number(b.isNew) - Number(a.isNew));
  if (sort === "deadline")
    by.sort((a, b) => (a.deadline.days ?? 9999) - (b.deadline.days ?? 9999) || b.score - a.score);
  if (sort === "recent") by.sort((a, b) => (b.registered ?? "").localeCompare(a.registered ?? "") || b.score - a.score);
  return by;
}

export function PositionsBoard({ data }: { data: BoardData }) {
  const router = useRouter();
  const [sort, setSort] = useState<Sort>("score");
  const [view, setView] = useState<View>("all");
  const [openGno, setOpenGno] = useState<number | null>(null);
  const [picker, setPicker] = useState(false);
  const [draft, setDraft] = useState<number[]>(data.duties);
  const [marks, setMarks] = useState<Record<number, PositionMark | undefined>>(
    Object.fromEntries(data.rows.map((r) => [r.gno, r.mark])),
  );
  const [running, setRunning] = useState(data.running);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 탭을 열면: 마지막 수집이 오래됐을 때만 서버가 수집을 시작한다(정기 수집 없음).
  useEffect(() => {
    let alive = true;
    fetch("/api/positions/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auto: true }),
    })
      .then((r) => r.json())
      .then((b: { collecting?: boolean }) => {
        if (alive && b.collecting) setRunning(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 수집 중이면 끝날 때까지 상태를 물어보고, 끝나면 새로 그린다.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      try {
        const s = (await (await fetch("/api/positions/status", { cache: "no-store" })).json()) as { running: boolean };
        if (!s.running) {
          setRunning(false);
          router.refresh();
        }
      } catch {
        /* 다음 주기에 다시 */
      }
    }, 4000);
    return () => clearInterval(t);
  }, [running, router]);

  const rows = data.rows.map((r) => ({ ...r, mark: marks[r.gno] }));
  const counts = {
    all: rows.filter((r) => r.mark !== "hidden").length,
    new: rows.filter((r) => r.isNew && r.mark !== "hidden").length,
    star: rows.filter((r) => r.mark === "star").length,
    hidden: rows.filter((r) => r.mark === "hidden").length,
  };
  const shown = sortRows(
    rows.filter((r) =>
      view === "hidden"
        ? r.mark === "hidden"
        : r.mark !== "hidden" && (view === "all" || (view === "new" ? r.isNew : r.mark === "star")),
    ),
    sort,
  );

  async function setMark(gno: number, mark: PositionMark | null) {
    const prev = marks[gno];
    setMarks((m) => ({ ...m, [gno]: mark ?? undefined }));
    try {
      const res = await fetch(`/api/positions/${gno}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setMarks((m) => ({ ...m, [gno]: prev }));
      setMsg("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
    }
  }

  async function saveDuties() {
    if (!draft.length) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/positions/duties", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duties: draft }),
      });
      const body = (await res.json().catch(() => ({}))) as { collecting?: boolean };
      if (!res.ok) throw new Error(String(res.status));
      setPicker(false);
      if (body.collecting) {
        setRunning(true);
        setMsg("직무를 바꿨습니다. 새 직무로 수집하는 중입니다(몇 분 걸릴 수 있어요).");
      }
      router.refresh();
    } catch {
      setMsg("직무를 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function removeDuty(code: number) {
    const next = data.duties.filter((d) => d !== code);
    if (!next.length) {
      setMsg("직무를 하나 이상 남겨 두세요.");
      return;
    }
    setDraft(next);
    setBusy(true);
    try {
      const res = await fetch("/api/positions/duties", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duties: next }),
      });
      if (!res.ok) throw new Error();
      setRunning(true);
      setMsg("직무를 바꿨습니다. 새 직무로 수집하는 중입니다.");
      router.refresh();
    } catch {
      setMsg("직무를 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function collectNow() {
    setMsg(null);
    try {
      const res = await fetch("/api/positions/collect", { method: "POST" });
      if (res.status === 429) {
        const b = (await res.json()) as { waitMs?: number };
        setMsg(`최근에 수집했습니다. ${Math.ceil((b.waitMs ?? 0) / 60000)}분 뒤에 다시 할 수 있어요.`);
        return;
      }
      if (!res.ok) throw new Error();
      setRunning(true);
    } catch {
      setMsg("수집을 시작하지 못했습니다.");
    }
  }

  const toggleDraft = (code: number) =>
    setDraft((d) => (d.includes(code) ? d.filter((x) => x !== code) : d.length >= DUTY_MAX ? d : [...d, code]));

  return (
    <>
      <div className={styles.duties}>
        <span className={styles.lab}>직무</span>
        {data.duties.map((d) => (
          <span key={d} className={styles.chip}>
            {dutyName(d)}
            <button type="button" aria-label={`${dutyName(d)} 빼기`} onClick={() => removeDuty(d)} disabled={busy}>
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          className={`${styles.chip} ${styles.chipAdd}`}
          aria-expanded={picker}
          onClick={() => {
            setDraft(data.duties);
            setPicker((v) => !v);
          }}
        >
          + 직무
        </button>
        <span className={styles.status}>
          게임잡 · {running ? "수집 중…" : runText(data.lastRun)} · {data.rows.length}건
          <button type="button" className={styles.btn} onClick={collectNow} disabled={running}>
            지금 수집
          </button>
        </span>
      </div>

      {picker ? (
        <div className={styles.picker}>
          <div className={styles.pickerHead}>
            <b>직무 고르기</b>
            <span className={styles.muted}>게임잡 직무 분류 그대로, 최대 {DUTY_MAX}개</span>
          </div>
          {DUTY_GROUPS.map((g) => (
            <div key={g.name}>
              <div className={styles.grp}>{g.name}</div>
              <div className={styles.checks}>
                {g.duties.map((d) => (
                  <label key={d.code}>
                    <input type="checkbox" checked={draft.includes(d.code)} onChange={() => toggleDraft(d.code)} />
                    {d.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className={styles.pickerActs}>
            <button type="button" className={styles.primary} onClick={saveDuties} disabled={busy || !draft.length}>
              {busy ? "저장 중…" : "저장하고 다시 수집"}
            </button>
            <button type="button" className={styles.btn} onClick={() => setPicker(false)} disabled={busy}>
              취소
            </button>
          </div>
        </div>
      ) : null}

      {msg ? (
        <p className={styles.msg} role="status">
          {msg}
        </p>
      ) : null}

      <div className={styles.bar}>
        <span className={styles.seg}>
          {(
            [
              ["score", "적합도순"],
              ["deadline", "마감 임박"],
              ["recent", "최신"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}>
              {label}
            </button>
          ))}
        </span>
        <span className={styles.seg}>
          {(
            [
              ["all", `전체 ${counts.all}`],
              ["new", `새 공고 ${counts.new}`],
              ["star", `⭐ ${counts.star}`],
              ["hidden", `숨김 ${counts.hidden}`],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}>
              {label}
            </button>
          ))}
        </span>
      </div>

      {shown.length ? (
        <table className={styles.tbl}>
          <thead>
            <tr>
              <th className={styles.num}>적합</th>
              <th>회사</th>
              <th>포지션</th>
              <th className={styles.hideM}>경력</th>
              <th>마감</th>
              <th aria-label="관심" />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const open = openGno === r.gno;
              const v = VERDICT[r.careerVerdict];
              const dl = deadlineText(r.deadline);
              return (
                <Fragment key={r.gno}>
                  <tr
                    className={`${styles.row} ${open ? styles.open : ""}`}
                    onClick={() => setOpenGno(open ? null : r.gno)}
                  >
                    <td className={styles.num}>
                      <span className={`${styles.score} ${scoreCls(r.score)}`}>{r.score}</span>
                      {r.uncertain ? (
                        <span className={styles.q} title={UNCERTAIN[r.uncertain]}>
                          ?
                        </span>
                      ) : null}
                    </td>
                    <td className={styles.co}>
                      {r.company}
                      {r.isNew ? <span className={styles.new}>N</span> : null}
                    </td>
                    <td className={styles.pos}>
                      <button type="button" className={styles.rowBtn} aria-expanded={open}>
                        {r.title}
                      </button>
                    </td>
                    <td className={`${styles.hideM} ${styles.muted}`}>
                      {r.career} <span className={styles[v.cls] ?? ""} title={v.title}>{v.mark}</span>
                    </td>
                    <td className={`${styles.dday} ${dl.soon ? styles.soon : ""}`}>{dl.text}</td>
                    <td className={styles.starCell}>
                      <button
                        type="button"
                        className={`${styles.star} ${r.mark === "star" ? styles.starOn : ""}`}
                        aria-label={r.mark === "star" ? "관심 해제" : "관심 표시"}
                        aria-pressed={r.mark === "star"}
                        onClick={(e) => {
                          e.stopPropagation();
                          void setMark(r.gno, r.mark === "star" ? null : "star");
                        }}
                      >
                        {r.mark === "star" ? "★" : "☆"}
                      </button>
                    </td>
                  </tr>
                  {open ? (
                    <tr className={styles.detail}>
                      <td className={styles.hideM} />
                      <td colSpan={5}>
                        <div className={styles.detailBox}>
                          <div className={styles.muted}>
                            {[r.meta, `경력 ${r.career}${v.mark ? ` ${v.mark}` : ""}`].filter(Boolean).join(" · ")}
                          </div>
                          {r.uncertain ? <div className={styles.note}>{UNCERTAIN[r.uncertain]}</div> : null}
                          {r.summary.length ? (
                            <ul className={styles.summary}>
                              {r.summary.map((s, i) => (
                                <li key={i}>{s}</li>
                              ))}
                            </ul>
                          ) : null}
                          {r.matched.length || r.missing.length ? (
                            <div className={styles.tags}>
                              {r.matched.map((m) => (
                                <span
                                  key={m.name}
                                  className={`${styles.t} ${styles.tOk}`}
                                  title={`${m.req ? "필수" : "우대·업무"} · 근거 성과 ${m.evidence}건`}
                                >
                                  {m.req ? <b>{m.name}</b> : m.name}
                                </span>
                              ))}
                              {r.missing.map((m) => (
                                <span
                                  key={m.name}
                                  className={`${styles.t} ${styles.tNo}`}
                                  title={`${m.req ? "필수" : "우대·업무"} · 내 기록에 없음`}
                                >
                                  {m.req ? <b>{m.name}</b> : m.name}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {r.evidence.length ? (
                            <div>
                              <p className={styles.evHead}>참고 · 기술이 겹치는 내 성과(자동 매칭)</p>
                              <ul className={styles.ev}>
                                {r.evidence.map((e) => (
                                  <li key={e.id}>{e.title}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          <div className={styles.acts}>
                            <a className={styles.btn} href={r.url} target="_blank" rel="noopener noreferrer">
                              게임잡에서 보기 ↗
                            </a>
                            <button
                              type="button"
                              className={styles.btn}
                              onClick={() => void setMark(r.gno, r.mark === "hidden" ? null : "hidden")}
                            >
                              {r.mark === "hidden" ? "숨김 해제" : "숨김"}
                            </button>
                            <span className={styles.muted}>굵은 글씨 = 필수 요건</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className={styles.empty}>
          {running
            ? "수집 중입니다. 끝나면 여기에 나타납니다."
            : view === "all"
              ? data.lastRun
                ? "고른 직무에 공고가 없습니다."
                : "아직 수집 전입니다. 잠시 후 자동으로 받아 옵니다."
              : "해당하는 공고가 없습니다."}
        </p>
      )}
    </>
  );
}
