"use client";

import { useState } from "react";
import type { CareerEntry, Profile, TechStackGroup } from "@/lib/store/types";
import styles from "../career.module.css";

interface GroupDraft {
  label: string;
  items: string; // 쉼표 구분
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function ProfileForm({ initial }: { initial: Profile }) {
  const [intro, setIntro] = useState(initial.intro ?? "");
  const [groups, setGroups] = useState<GroupDraft[]>(
    (initial.techStack ?? []).map((g) => ({ label: g.label, items: g.items.join(", ") })),
  );
  const [career, setCareer] = useState<CareerEntry[]>(initial.career ?? []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function patchGroup(i: number, patch: Partial<GroupDraft>) {
    setGroups((prev) => prev.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  }
  function patchCareer(i: number, patch: Partial<CareerEntry>) {
    setCareer((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const techStack: TechStackGroup[] = groups
      .map((g) => ({
        label: g.label.trim(),
        items: g.items
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }))
      .filter((g) => g.label || g.items.length);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intro, techStack, career }),
      });
      setMsg(res.ok ? "저장했습니다." : "저장에 실패했습니다.");
    } catch {
      setMsg("저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.sec}>
      <div className={styles.seclbl2}>2줄 소개</div>
      <textarea
        className={styles.fArea}
        rows={3}
        placeholder="나를 설명하는 2줄 요약 — 공개 Showcase 홈 상단에 그대로 노출됩니다."
        value={intro}
        onChange={(e) => setIntro(e.target.value)}
      />

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

      <div className={styles.seclbl2}>경력 사항</div>
      {career.map((c, i) => (
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
          <div className={styles.frow} style={{ marginTop: 8 }}>
            <input
              className={styles.fTech}
              placeholder="기간 (예: 2021.03 – 현재)"
              value={c.period ?? ""}
              onChange={(e) => patchCareer(i, { period: e.target.value })}
            />
            <input
              className={styles.fTech}
              placeholder="비고 (선택)"
              value={c.note ?? ""}
              onChange={(e) => patchCareer(i, { note: e.target.value })}
            />
          </div>
          <button
            type="button"
            className={styles.mini}
            style={{ marginTop: 8 }}
            onClick={() => setCareer((prev) => prev.filter((_, idx) => idx !== i))}
          >
            경력 삭제
          </button>
        </div>
      ))}
      <button
        type="button"
        className={styles.addBtn}
        onClick={() => setCareer((prev) => [...prev, { id: newId() }])}
      >
        + 경력 추가
      </button>

      <div className={styles.formActions} style={{ marginTop: 20, alignItems: "center" }}>
        {msg ? <span className={styles.srcs}>{msg}</span> : null}
        <button type="button" className={styles.saveBtn} onClick={save} disabled={busy}>
          {busy ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}
