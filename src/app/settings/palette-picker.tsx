"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  MAX_USER_PALETTES,
  PRESET_PALETTES,
  TONES,
  TONE_LABEL,
  allPalettes,
  buildPalette,
  newUserPaletteId,
  paletteCss,
  type Palette,
  type PaletteSpec,
  type Tone,
} from "@/lib/palette";
import { applyPalette, readPalette, savePalette } from "@/lib/theme";
import seg from "@/app/components/theme-toggle.module.css";
import styles from "./palette.module.css";

// 색 팔레트 고르기·만들기(ADR-018). 고르기는 이 기기에만(localStorage), 만든 팔레트와
// Showcase 공개 팔레트는 설정(원격)에 저장된다.

const SWATCHES = ["#3b43c4", "#2563eb", "#0f766e", "#15803d", "#b45309", "#be123c", "#7c3aed", "#475569"];
const PREVIEW_ID = "preview";
const HEX6 = /^#[0-9a-f]{6}$/i;

type Draft = { id: string | null; name: string; accent: string; tone: Tone };

export function PalettePicker({
  initialSpecs,
  initialShowcase,
  configured,
}: {
  initialSpecs: PaletteSpec[];
  initialShowcase: string;
  configured: boolean;
}) {
  const router = useRouter();
  const [specs, setSpecs] = useState(initialSpecs);
  const [selected, setSelected] = useState("default");
  const [showcase, setShowcase] = useState(initialShowcase);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 실제 적용은 <head> 스크립트가 이미 했다. 마운트 후 표시만 맞춘다(하이드레이션 일치).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(readPalette());
  }, []);

  const userPalettes = useMemo(() => specs.map(buildPalette), [specs]);
  const preview = useMemo(
    () => (draft && HEX6.test(draft.accent) ? buildPalette({ id: PREVIEW_ID, name: "미리보기", accent: draft.accent, tone: draft.tone }) : null),
    [draft],
  );

  // 편집 중에는 화면 전체를 미리보기 팔레트로 보여 준다.
  useEffect(() => {
    if (preview) applyPalette(PREVIEW_ID);
  }, [preview]);

  // 방금 만든 팔레트도 새로고침 없이 바로 쓰이도록 CSS 를 여기서도 넣는다(레이아웃의 것과 같은 값).
  const css = [...userPalettes, ...(preview ? [preview] : [])].map((p) => paletteCss(p)).join("\n");

  function choose(id: string) {
    setSelected(id);
    savePalette(id);
    applyPalette(id);
  }

  async function put(body: Record<string, unknown>): Promise<{ palettes?: PaletteSpec[]; showcasePalette?: string } | null> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const { settings } = (await res.json()) as { settings: { palettes?: PaletteSpec[]; showcasePalette?: string } };
      router.refresh(); // 레이아웃의 팔레트 CSS·Showcase 팔레트 갱신
      return settings;
    } catch {
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function startNew() {
    setDraft({ id: null, name: `내 팔레트 ${specs.length + 1}`, accent: SWATCHES[0]!, tone: "neutral" });
  }

  function startEdit(s: PaletteSpec) {
    setDraft({ id: s.id, name: s.name, accent: s.accent, tone: s.tone });
  }

  function cancel() {
    setDraft(null);
    applyPalette(selected);
  }

  async function saveDraft() {
    if (!draft || !HEX6.test(draft.accent) || !draft.name.trim()) return;
    const id = draft.id ?? newUserPaletteId();
    const spec: PaletteSpec = { id, name: draft.name.trim().slice(0, 20), accent: draft.accent.toLowerCase(), tone: draft.tone };
    const next = draft.id ? specs.map((s) => (s.id === id ? spec : s)) : [...specs, spec];
    const saved = await put({ palettes: next });
    if (!saved) return;
    setSpecs(saved.palettes ?? next);
    setDraft(null);
    choose(id);
  }

  async function remove(s: PaletteSpec) {
    if (!confirm(`"${s.name}" 팔레트를 삭제할까요?`)) return;
    const saved = await put({ palettes: specs.filter((x) => x.id !== s.id) });
    if (!saved) return;
    setSpecs(saved.palettes ?? []);
    if (saved.showcasePalette) setShowcase(saved.showcasePalette);
    if (selected === s.id) choose("default");
  }

  async function chooseShowcase(id: string) {
    const prev = showcase;
    setShowcase(id);
    const saved = await put({ showcasePalette: id });
    if (!saved) setShowcase(prev);
  }

  const all = allPalettes(specs);

  return (
    <div className={styles.wrap}>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div className={styles.subTitle}>색 팔레트 · 이 기기</div>
      <div className={styles.grid}>
        {[...PRESET_PALETTES, ...userPalettes].map((p) => {
          const spec = specs.find((s) => s.id === p.id);
          return (
            <div key={p.id} className={styles.item}>
              <button
                type="button"
                className={styles.card}
                data-on={!draft && selected === p.id}
                aria-pressed={selected === p.id}
                onClick={() => choose(p.id)}
                disabled={Boolean(draft)}
              >
                <Swatch p={p} />
                <span className={styles.name}>{p.name}</span>
              </button>
              {spec && !draft ? (
                <div className={styles.itemActs}>
                  <button type="button" className={styles.textBtn} onClick={() => startEdit(spec)} disabled={busy}>
                    수정
                  </button>
                  <button type="button" className={styles.textBtn} onClick={() => remove(spec)} disabled={busy}>
                    삭제
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {configured && !draft ? (
        specs.length < MAX_USER_PALETTES ? (
          <button type="button" className={styles.addBtn} onClick={startNew}>
            + 내 팔레트 만들기
          </button>
        ) : (
          <p className={styles.note}>내 팔레트는 {MAX_USER_PALETTES}개까지 만들 수 있습니다.</p>
        )
      ) : null}

      {draft ? (
        <div className={styles.editor}>
          <label className={styles.field}>
            <span className={styles.label}>이름</span>
            <input
              className={styles.input}
              value={draft.name}
              maxLength={20}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <div className={styles.field}>
            <span className={styles.label}>강조색</span>
            <div className={styles.swatches}>
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={styles.dot}
                  style={{ background: c }}
                  data-on={draft.accent.toLowerCase() === c}
                  aria-label={c}
                  onClick={() => setDraft({ ...draft, accent: c })}
                />
              ))}
              <input
                type="color"
                className={styles.colorInput}
                value={HEX6.test(draft.accent) ? draft.accent : "#000000"}
                onChange={(e) => setDraft({ ...draft, accent: e.target.value })}
                aria-label="직접 고르기"
              />
              <input
                className={`${styles.input} ${styles.hex}`}
                value={draft.accent}
                maxLength={7}
                onChange={(e) => setDraft({ ...draft, accent: e.target.value.trim() })}
                aria-label="hex"
              />
            </div>
          </div>
          <div className={styles.field}>
            <span className={styles.label}>배경 톤</span>
            <div className={seg.seg} role="group" aria-label="배경 톤">
              {TONES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={seg.opt}
                  data-on={draft.tone === t}
                  aria-pressed={draft.tone === t}
                  onClick={() => setDraft({ ...draft, tone: t })}
                >
                  {TONE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
          <p className={styles.note}>
            지금 화면 전체가 미리보기입니다. 강조색은 글자와 대비(4.5:1)가 모자라면 자동으로 진하게(다크에선 밝게) 맞춥니다.
          </p>
          <div className={styles.editorActs}>
            <button type="button" className={styles.textBtn} onClick={cancel} disabled={busy}>
              취소
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={saveDraft}
              disabled={busy || !HEX6.test(draft.accent) || !draft.name.trim()}
            >
              {busy ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      ) : null}

      {configured ? (
        <label className={`${styles.field} ${styles.showcase}`}>
          <span className={styles.label}>Showcase</span>
          <select
            className={styles.input}
            value={showcase}
            onChange={(e) => chooseShowcase(e.target.value)}
            disabled={busy}
          >
            {all.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className={styles.note}>공개 페이지 방문자에게 보이는 팔레트(라이트·다크는 방문자 OS)</span>
        </label>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}

/** 라이트판·다크판을 반씩: 바탕 위에 카드 한 장과 강조색 점. */
function Swatch({ p }: { p: Palette }) {
  return (
    <span className={styles.swatch} aria-hidden="true">
      {(["light", "dark"] as const).map((m) => (
        <span key={m} className={styles.half} style={{ background: p[m].bg }}>
          <span className={styles.mini} style={{ background: p[m].surface, borderColor: p[m].border }}>
            <span className={styles.miniLine} style={{ background: p[m].text }} />
            <span className={styles.miniLine} style={{ background: p[m]["text-muted"], width: "60%" }} />
          </span>
          <span className={styles.accent} style={{ background: p[m].accent }} />
        </span>
      ))}
    </span>
  );
}
