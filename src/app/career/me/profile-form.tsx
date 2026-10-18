"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CAREER_NOTE_MAX,
  HEADLINE_MAX,
  INTRO_MAX,
  NAME_MAX,
} from "@/lib/career-limits";
import {
  currentYearMonth,
  parseYearMonth,
  validatePeriod,
  type PeriodError,
} from "@/lib/period";
import { LINK_LABEL_MAX, LINKS_MAX, isEmail, safeUrl } from "@/lib/contact";
import type { CareerEntry, Profile, ProfileLink, TechStackGroup } from "@/lib/store/types";
import { todayKst } from "@/lib/time";
import styles from "../career.module.css";

interface GroupDraft {
  label: string;
  items: string; // 쉼표 구분
}

const PERIOD_MSG: Record<PeriodError, string> = {
  start_required: "시작 월을 입력하세요.",
  end_before_start: "종료 월이 시작 월보다 앞입니다.",
  future: "미래 날짜는 넣을 수 없습니다.",
};

/**
 * 기술 목록 나누기. 괄호 안의 쉼표는 나누지 않는다 —
 * "AWS(EC2, ALB, Lambda), Docker" → ["AWS(EC2, ALB, Lambda)", "Docker"].
 */
function splitTech(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    if ((ch === ")" || ch === "]") && depth > 0) depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((t) => t.trim()).filter(Boolean);
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

/** month 입력이 없는 브라우저(구형 Safari)는 글자로 들어오므로 "2024.01" 도 받아 준다. */
function normYm(v: string | undefined): string | undefined {
  if (!v) return undefined;
  return parseYearMonth(v) ?? undefined;
}

function serialize(p: {
  name: string;
  headline: string;
  email: string;
  links: ProfileLink[];
  intro: string;
  groups: GroupDraft[];
  career: CareerEntry[];
}): string {
  return JSON.stringify(p);
}

export function ProfileForm({ initial }: { initial: Profile }) {
  const [name, setName] = useState(initial.name ?? "");
  const [headline, setHeadline] = useState(initial.headline ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [links, setLinks] = useState<ProfileLink[]>(initial.links ?? []);
  const [intro, setIntro] = useState(initial.intro ?? "");
  const [groups, setGroups] = useState<GroupDraft[]>(
    (initial.techStack ?? []).map((g) => ({ label: g.label, items: g.items.join(", ") })),
  );
  const [career, setCareer] = useState<CareerEntry[]>(initial.career ?? []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(() =>
    serialize({
      name: initial.name ?? "",
      headline: initial.headline ?? "",
      email: initial.email ?? "",
      links: initial.links ?? [],
      intro: initial.intro ?? "",
      groups: (initial.techStack ?? []).map((g) => ({ label: g.label, items: g.items.join(", ") })),
      career: initial.career ?? [],
    }),
  );

  const now = currentYearMonth(todayKst());
  const dirty = serialize({ name, headline, email, links, intro, groups, career }) !== saved;

  // 저장하지 않고 떠나면 경고(입력이 긴 화면이라 실수로 잃기 쉽다).
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const errors = useMemo(
    () =>
      career.map((c) =>
        c.start || c.end || c.current
          ? validatePeriod({ start: normYm(c.start), end: normYm(c.end), current: c.current }, now)
          : c.period
            ? null // 옮기지 못한 예전 기간 — 안내만
            : "start_required",
      ),
    [career, now],
  );
  const emailBad = email.trim() !== "" && !isEmail(email);
  const linkBad = links.map((l) => !safeUrl(l.url));
  const hasError = errors.some(Boolean) || emailBad || linkBad.some(Boolean);

  function patchGroup(i: number, patch: Partial<GroupDraft>) {
    setGroups((prev) => prev.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  }
  function patchLink(i: number, patch: Partial<ProfileLink>) {
    setLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function patchCareer(i: number, patch: Partial<CareerEntry>) {
    setCareer((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  async function save() {
    if (hasError) {
      setMsg(emailBad || linkBad.some(Boolean) ? "연락처를 확인해 주세요." : "경력 기간을 확인해 주세요.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const techStack: TechStackGroup[] = groups
      .map((g) => ({ label: g.label.trim(), items: splitTech(g.items) }))
      .filter((g) => g.label || g.items.length);
    const careerOut = career.map((c) => ({
      ...c,
      start: normYm(c.start),
      end: c.current ? undefined : normYm(c.end),
    }));
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, headline, email, links, intro, techStack, career: careerOut }),
      });
      const body = (await res.json().catch(() => ({}))) as { profile?: Profile };
      if (!res.ok || !body.profile) {
        setMsg("저장에 실패했습니다.");
        return;
      }
      // 서버가 정리·최신순 정렬한 결과로 화면을 맞춘다.
      const p = body.profile;
      const nextGroups = p.techStack.map((g) => ({ label: g.label, items: g.items.join(", ") }));
      setName(p.name ?? "");
      setHeadline(p.headline ?? "");
      setEmail(p.email ?? "");
      setLinks(p.links ?? []);
      setIntro(p.intro ?? "");
      setGroups(nextGroups);
      setCareer(p.career);
      setSaved(
        serialize({
          name: p.name ?? "",
          headline: p.headline ?? "",
          email: p.email ?? "",
          links: p.links ?? [],
          intro: p.intro ?? "",
          groups: nextGroups,
          career: p.career,
        }),
      );
      setMsg("저장했습니다.");
    } catch {
      setMsg("저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.sec}>
      <div className={styles.seclbl2}>이름 · 직함</div>
      <div className={styles.frow}>
        <input
          className={styles.fTech}
          placeholder="이름 (Showcase 제목·공유 미리보기)"
          maxLength={NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={styles.fTech}
          placeholder="직함 (예: 게임 서버 개발자)"
          maxLength={HEADLINE_MAX}
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
        />
      </div>

      <div className={styles.seclbl2}>연락처 · 링크 (Showcase 상단에 표시)</div>
      <input
        className={styles.fTech}
        style={{ width: "100%" }}
        type="email"
        placeholder="이메일 — 공개 화면에선 '복사' 를 눌러야 보입니다"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {emailBad ? <p className={styles.warn}>이메일 형식이 아닙니다.</p> : null}
      {links.map((l, i) => (
        <div key={i}>
          <div className={styles.frow} style={{ marginTop: 8 }}>
            <input
              className={styles.fTech}
              style={{ flex: "0 1 140px" }}
              placeholder="이름 (예: GitHub)"
              maxLength={LINK_LABEL_MAX}
              value={l.label}
              onChange={(e) => patchLink(i, { label: e.target.value })}
            />
            <input
              className={styles.fTech}
              placeholder="https://github.com/…"
              value={l.url}
              onChange={(e) => patchLink(i, { url: e.target.value })}
            />
            <button
              type="button"
              className={styles.mini}
              onClick={() => setLinks((prev) => prev.filter((_, idx) => idx !== i))}
            >
              삭제
            </button>
          </div>
          {linkBad[i] ? <p className={styles.warn}>http(s) 주소만 넣을 수 있습니다.</p> : null}
        </div>
      ))}
      {links.length < LINKS_MAX ? (
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => setLinks((prev) => [...prev, { label: "", url: "" }])}
        >
          + 링크 추가 ({links.length}/{LINKS_MAX})
        </button>
      ) : null}

      <div className={styles.seclbl2}>한마디</div>
      <textarea
        className={styles.fArea}
        rows={3}
        maxLength={INTRO_MAX}
        placeholder="나를 설명하는 2줄 — 공개 Showcase 맨 위에 그대로 나옵니다(줄바꿈 유지)."
        value={intro}
        onChange={(e) => setIntro(e.target.value)}
      />
      <div className={styles.counter}>
        {intro.length} / {INTRO_MAX}
      </div>

      <div className={styles.seclbl2}>기술 스택</div>
      {groups.map((g, i) => (
        <div key={i} className={styles.subcard}>
          <div className={styles.frow}>
            <input
              className={styles.fTech}
              placeholder="그룹명 (예: 언어 · 런타임)"
              value={g.label}
              onChange={(e) => patchGroup(i, { label: e.target.value })}
            />
            <button
              type="button"
              className={styles.mini}
              onClick={() => setGroups((prev) => prev.filter((_, idx) => idx !== i))}
            >
              그룹 삭제
            </button>
          </div>
          <input
            className={styles.fTech}
            style={{ width: "100%", marginTop: 8 }}
            placeholder="기술 (쉼표: C#, .NET, Redis)"
            value={g.items}
            onChange={(e) => patchGroup(i, { items: e.target.value })}
          />
        </div>
      ))}
      <button
        type="button"
        className={styles.addBtn}
        onClick={() => setGroups((prev) => [...prev, { label: "", items: "" }])}
      >
        + 그룹 추가
      </button>

      <div className={styles.seclbl2}>경력 사항 (저장하면 최신순으로 정렬)</div>
      {career.map((c, i) => {
        const err = errors[i];
        return (
          <div key={c.id || i} className={styles.subcard}>
            <div className={styles.frow}>
              <input
                className={styles.fTech}
                placeholder="회사 / 소속"
                value={c.org ?? ""}
                onChange={(e) => patchCareer(i, { org: e.target.value })}
              />
              <input
                className={styles.fTech}
                placeholder="역할"
                value={c.role ?? ""}
                onChange={(e) => patchCareer(i, { role: e.target.value })}
              />
            </div>
            <div className={styles.periodRow}>
              <label className={styles.periodField}>
                <span>시작</span>
                <input
                  type="month"
                  className={styles.fTech}
                  max={now}
                  value={c.start ?? ""}
                  onChange={(e) => patchCareer(i, { start: e.target.value || undefined })}
                />
              </label>
              <label className={styles.periodField}>
                <span>종료</span>
                <input
                  type="month"
                  className={styles.fTech}
                  max={now}
                  disabled={c.current}
                  value={c.current ? "" : (c.end ?? "")}
                  onChange={(e) => patchCareer(i, { end: e.target.value || undefined })}
                />
              </label>
              <label className={styles.hideToggle}>
                <input
                  type="checkbox"
                  checked={Boolean(c.current)}
                  onChange={(e) => patchCareer(i, { current: e.target.checked || undefined })}
                />
                재직 중
              </label>
            </div>
            {c.period && !c.start ? (
              <p className={styles.warn}>
                예전에 적은 기간 “{c.period}”을 날짜로 옮기지 못했습니다. 시작·종료 월을 지정해 주세요.
              </p>
            ) : null}
            {err ? <p className={styles.warn}>{PERIOD_MSG[err]}</p> : null}
            <textarea
              className={styles.fArea}
              rows={4}
              maxLength={CAREER_NOTE_MAX}
              placeholder="비고 (여러 줄 가능) — 맡은 일·주요 성과"
              value={c.note ?? ""}
              onChange={(e) => patchCareer(i, { note: e.target.value })}
              style={{ marginTop: 8 }}
            />
            <div className={styles.cardFoot}>
              <button
                type="button"
                className={styles.mini}
                onClick={() => setCareer((prev) => prev.filter((_, idx) => idx !== i))}
              >
                경력 삭제
              </button>
              <span className={styles.counter}>
                {(c.note ?? "").length} / {CAREER_NOTE_MAX}
              </span>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className={styles.addBtn}
        onClick={() => setCareer((prev) => [{ id: newId() }, ...prev])}
      >
        + 경력 추가
      </button>

      <div className={styles.formActions} style={{ marginTop: 20, alignItems: "center" }}>
        {msg ? <span className={styles.srcs}>{msg}</span> : dirty ? <span className={styles.srcs}>저장하지 않은 변경이 있습니다</span> : null}
        <button type="button" className={styles.saveBtn} onClick={save} disabled={busy || !dirty}>
          {busy ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}

