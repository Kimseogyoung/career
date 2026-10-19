"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_USER_PALETTES,
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
import {
  BUTTONS,
  BUTTON_LABEL,
  CARDS,
  CARD_LABEL,
  DEFAULT_THEME_ID,
  FITS,
  FIT_LABEL,
  MAX_THEME_ASSETS,
  MAX_USER_THEMES,
  PANELS,
  PANEL_LABEL,
  PRESET_THEMES,
  RADII,
  RADIUS_LABEL,
  THEME_BYTES_MAX,
  THEME_LONG_EDGE,
  allThemeIds,
  minDimFor,
  newUserThemeId,
  presetTheme,
  resolveTheme,
  themeAssetUrl,
  themeCss,
  type AppImageChoice,
  type ImageChoice,
  type ImageKind,
  type ResolveContext,
  type Shape,
  type ThemeAsset,
  type ThemeSpec,
} from "@/lib/themes";
import { applyPalette, applyThemeId, readThemeId, saveThemeId } from "@/lib/theme";
import { prepareImage } from "@/app/components/image-prep";
import seg from "@/app/components/theme-toggle.module.css";
import styles from "./theme-picker.module.css";

// 테마 고르기·만들기(ADR-018 T-3). 고르기는 이 기기에만(localStorage), 내 테마·내 팔레트·올린 이미지와
// Showcase 공개 테마는 설정(원격)에 저장된다. 편집 중에는 화면 전체가 미리보기다.

const PREVIEW_TID = "preview";
const PREVIEW_PALETTE = "pv-palette";
const SWATCHES = [
  "#3b43c4",
  "#2563eb",
  "#0f766e",
  "#15803d",
  "#b45309",
  "#be123c",
  "#7c3aed",
  "#475569",
];
const HEX6 = /^#[0-9a-f]{6}$/i;

type Slot = "app" | "band" | "show";
const SLOT_LABEL: Record<Slot, string> = { app: "앱 바탕", band: "머리줄", show: "Showcase" };

interface Draft {
  id: string | null; // 고치는 내 테마 id. null 이면 새로 만든다
  name: string;
  base: string;
  palette: string;
  shape: Shape;
  images: { app: AppImageChoice; band: ImageChoice; show: ImageChoice };
}

interface Props {
  initialPaletteSpecs: PaletteSpec[];
  initialThemeSpecs: ThemeSpec[];
  initialAssets: ThemeAsset[];
  initialShowcase: string;
  configured: boolean;
}

export function ThemePicker({
  initialPaletteSpecs,
  initialThemeSpecs,
  initialAssets,
  initialShowcase,
  configured,
}: Props) {
  const router = useRouter();
  const [paletteSpecs, setPaletteSpecs] = useState(initialPaletteSpecs);
  const [themeSpecs, setThemeSpecs] = useState(initialThemeSpecs);
  const [assets, setAssets] = useState(initialAssets);
  const [showcase, setShowcase] = useState(initialShowcase);
  const [selected, setSelected] = useState(DEFAULT_THEME_ID);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [palDraft, setPalDraft] = useState<{ name: string; accent: string; tone: Tone } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const palettes = useMemo(() => allPalettes(paletteSpecs), [paletteSpecs]);
  const ctx: ResolveContext = useMemo(() => {
    const ids = new Set(palettes.map((p) => p.id));
    return {
      specs: themeSpecs,
      assets,
      paletteExists: (id) => ids.has(id),
      assetUrl: themeAssetUrl,
    };
  }, [palettes, themeSpecs, assets]);
  const paletteOf = useMemo(() => {
    const m: Record<string, string> = {};
    for (const id of allThemeIds(themeSpecs)) m[id] = resolveTheme(id, ctx).palette;
    return m;
  }, [themeSpecs, ctx]);

  useEffect(() => {
    // 실제 적용은 <head> 스크립트가 이미 했다. 마운트 후 표시만 맞춘다(하이드레이션 일치).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(readThemeId());
  }, []);

  // 미리보기: 편집 중인 테마(와 만드는 중인 팔레트)를 화면 전체에 건다.
  const previewPalette: Palette | null =
    palDraft && HEX6.test(palDraft.accent)
      ? buildPalette({
          id: PREVIEW_PALETTE,
          name: "미리보기",
          accent: palDraft.accent,
          tone: palDraft.tone,
        })
      : null;
  const previewCss = useMemo(() => {
    if (!draft) return "";
    const spec = { ...draftToSpec(draft, draft.id ?? "t-preview"), id: "t-preview" };
    const t = resolveTheme("t-preview", { ...ctx, specs: [spec] });
    return themeCss(t, PREVIEW_TID);
  }, [draft, ctx]);
  const previewPaletteId = draft
    ? palDraft && previewPalette
      ? PREVIEW_PALETTE
      : resolvePal(draft, ctx)
    : null;

  useEffect(() => {
    if (!draft || !previewPaletteId) return;
    document.documentElement.setAttribute("data-tid", PREVIEW_TID);
    applyPalette(previewPaletteId);
  }, [draft, previewPaletteId, previewCss]);

  // 방금 만든 팔레트·테마도 새로고침 없이 바로 쓰이도록 CSS 를 여기서도 넣는다(레이아웃의 것과 같은 값).
  const localCss = [
    ...paletteSpecs.map((s) => paletteCss(buildPalette(s))),
    ...(previewPalette ? [paletteCss(previewPalette)] : []),
    ...themeSpecs.map((s) => themeCss(resolveTheme(s.id, ctx))),
    previewCss,
  ].join("\n");

  function choose(id: string) {
    setSelected(id);
    saveThemeId(id);
    applyThemeId(id, paletteOf);
  }

  async function put(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const { settings } = (await res.json()) as {
        settings: { palettes?: PaletteSpec[]; themes?: ThemeSpec[]; showcaseTheme?: string };
      };
      router.refresh(); // 레이아웃의 테마 CSS·Showcase 테마 갱신
      return settings;
    } catch {
      setError("저장하지 못했습니다. 잠시 후 다시 시도하세요.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function startEdit(id: string) {
    const spec = themeSpecs.find((s) => s.id === id);
    const base = presetTheme(spec?.base ?? id) ?? PRESET_THEMES[0]!;
    const preset = base.images.app ?? { fit: "cover" as const, blur: 0, dim: 0.2 };
    setDraft({
      id: spec?.id ?? null,
      name: spec?.name ?? `내 ${base.name}`,
      base: base.id,
      palette: spec?.palette ?? base.palette,
      shape: { ...base.shape, ...spec?.shape },
      images: {
        app: {
          kind: spec?.images?.app?.kind ?? (base.images.app ? "preset" : "none"),
          asset: spec?.images?.app?.asset,
          fit: spec?.images?.app?.fit ?? preset.fit,
          blur: spec?.images?.app?.blur ?? preset.blur,
          dim: spec?.images?.app?.dim ?? preset.dim,
        },
        band: spec?.images?.band ?? { kind: base.images.band ? "preset" : "none" },
        show: spec?.images?.show ?? { kind: base.images.show ? "preset" : "none" },
      },
    });
  }

  function cancel() {
    setDraft(null);
    setPalDraft(null);
    applyThemeId(selected, paletteOf);
  }

  async function saveDraft() {
    if (!draft || !draft.name.trim()) return;
    const id = draft.id ?? newUserThemeId();
    const spec = draftToSpec(draft, id);
    const next = draft.id ? themeSpecs.map((s) => (s.id === id ? spec : s)) : [...themeSpecs, spec];
    const saved = await put({ themes: next });
    if (!saved) return;
    const specs = saved.themes ?? next;
    setThemeSpecs(specs);
    setDraft(null);
    setPalDraft(null);
    setSelected(id);
    saveThemeId(id);
    const m = { ...paletteOf, [id]: resolveTheme(id, { ...ctx, specs }).palette };
    applyThemeId(id, m);
  }

  async function removeTheme(s: ThemeSpec) {
    if (!confirm(`"${s.name}" 테마를 삭제할까요?`)) return;
    const saved = await put({ themes: themeSpecs.filter((x) => x.id !== s.id) });
    if (!saved) return;
    setThemeSpecs(saved.themes ?? []);
    if (saved.showcaseTheme) setShowcase(saved.showcaseTheme);
    if (selected === s.id) choose(DEFAULT_THEME_ID);
  }

  async function chooseShowcase(id: string) {
    const prev = showcase;
    setShowcase(id);
    const saved = await put({ showcaseTheme: id });
    if (!saved) setShowcase(prev);
  }

  async function savePalette() {
    if (!palDraft || !HEX6.test(palDraft.accent) || !palDraft.name.trim() || !draft) return;
    const spec: PaletteSpec = {
      id: newUserPaletteId(),
      name: palDraft.name.trim().slice(0, 20),
      accent: palDraft.accent.toLowerCase(),
      tone: palDraft.tone,
    };
    const saved = await put({ palettes: [...paletteSpecs, spec] });
    if (!saved) return;
    setPaletteSpecs(saved.palettes ?? [...paletteSpecs, spec]);
    setPalDraft(null);
    setDraft({ ...draft, palette: spec.id });
  }

  async function removePalette(s: PaletteSpec) {
    if (
      !confirm(
        `"${s.name}" 팔레트를 삭제할까요? 이 팔레트를 쓰던 테마는 바탕 테마 색으로 돌아갑니다.`,
      )
    )
      return;
    const saved = await put({ palettes: paletteSpecs.filter((x) => x.id !== s.id) });
    if (!saved) return;
    setPaletteSpecs(saved.palettes ?? []);
    if (draft?.palette === s.id)
      setDraft({ ...draft, palette: presetTheme(draft.base)?.palette ?? "default" });
  }

  async function upload(file: File, slot: Slot) {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const img = await prepareImage(file, {
        longEdge: THEME_LONG_EDGE,
        maxBytes: THEME_BYTES_MAX,
      });
      const q = new URLSearchParams({
        w: String(img.width),
        h: String(img.height),
        lum: img.lum.toFixed(3),
      });
      const res = await fetch(`/api/theme-assets?${q}`, { method: "POST", body: img.blob });
      if (res.status === 409)
        throw new Error(
          `이미지는 ${MAX_THEME_ASSETS}장까지 올릴 수 있습니다. 안 쓰는 이미지를 지워 주세요.`,
        );
      if (!res.ok) throw new Error("올리지 못했습니다. 잠시 후 다시 시도하세요.");
      const { asset } = (await res.json()) as { asset: ThemeAsset };
      setAssets((a) => [...a, asset]);
      setDraft((d) => (d ? setSlot(d, slot, { kind: "upload", asset: asset.id }) : d));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeAsset(a: ThemeAsset) {
    if (!confirm("이 이미지를 지울까요? 이 이미지를 쓰던 테마는 기본 그림으로 돌아갑니다.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/theme-assets/${a.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setAssets((list) => list.filter((x) => x.id !== a.id));
      setThemeSpecs((specs) => specs.map((s) => dropAsset(s, a.id)));
      setDraft((d) => (d ? clearAsset(d, a.id) : d));
      router.refresh();
    } catch {
      setError("지우지 못했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  }

  const items: { id: string; name: string; tag: string; user?: ThemeSpec }[] = [
    ...PRESET_THEMES.map((t) => ({ id: t.id, name: t.name, tag: t.tag })),
    ...themeSpecs.map((s) => ({
      id: s.id,
      name: s.name,
      tag: `${presetTheme(s.base)?.name ?? ""} 바탕`,
      user: s,
    })),
  ];

  return (
    <div className={styles.wrap}>
      <style dangerouslySetInnerHTML={{ __html: localCss }} />

      <div className={styles.subTitle}>테마 · 이 기기</div>
      <div className={styles.grid}>
        {items.map((it) => {
          const t = resolveTheme(it.id, ctx);
          const pal = palettes.find((p) => p.id === t.palette) ?? palettes[0]!;
          const pic = t.show ?? t.band ?? t.app?.url ?? null;
          return (
            <div key={it.id} className={styles.item}>
              <button
                type="button"
                className={styles.card}
                data-on={!draft && selected === it.id}
                aria-pressed={selected === it.id}
                onClick={() => choose(it.id)}
                disabled={Boolean(draft)}
              >
                <span
                  className={styles.pic}
                  style={{
                    backgroundColor: pal.light.bg,
                    backgroundImage: pic ? `url("${pic}")` : undefined,
                  }}
                >
                  <span className={styles.dots}>
                    <i style={{ background: pal.light.accent }} />
                    <i style={{ background: pal.light.surface }} />
                    <i style={{ background: pal.dark.bg }} />
                  </span>
                </span>
                <span className={styles.txt}>
                  <b>{it.name}</b>
                  <small>{it.tag}</small>
                </span>
              </button>
              {configured && !draft ? (
                <div className={styles.itemActs}>
                  {it.user ? (
                    <>
                      <button
                        type="button"
                        className={styles.textBtn}
                        onClick={() => startEdit(it.id)}
                        disabled={busy}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className={styles.textBtn}
                        onClick={() => removeTheme(it.user!)}
                        disabled={busy}
                      >
                        삭제
                      </button>
                    </>
                  ) : themeSpecs.length < MAX_USER_THEMES ? (
                    <button
                      type="button"
                      className={styles.textBtn}
                      onClick={() => startEdit(it.id)}
                      disabled={busy}
                    >
                      바꿔서 만들기
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {configured && !draft && themeSpecs.length >= MAX_USER_THEMES ? (
        <p className={styles.note}>내 테마는 {MAX_USER_THEMES}개까지 만들 수 있습니다.</p>
      ) : null}

      {draft ? (
        <div className={styles.editor}>
          <div className={styles.editorHead}>
            <b>{draft.id ? "내 테마 고치기" : "내 테마 만들기"}</b>
            <span className={styles.note}>
              바탕: {presetTheme(draft.base)?.name} · 지금 화면 전체가 미리보기입니다
            </span>
          </div>
          <label className={styles.field}>
            <span className={styles.label}>이름</span>
            <input
              className={styles.input}
              value={draft.name}
              maxLength={20}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>

          <div className={styles.group}>색</div>
          <div className={styles.field}>
            <span className={styles.label}>팔레트</span>
            <div className={styles.palettes}>
              {palettes.map((p) => {
                const user = paletteSpecs.find((s) => s.id === p.id);
                return (
                  <span key={p.id} className={styles.palItem}>
                    <button
                      type="button"
                      className={styles.palChip}
                      data-on={draft.palette === p.id && !palDraft}
                      onClick={() => {
                        setPalDraft(null);
                        setDraft({ ...draft, palette: p.id });
                      }}
                      title={p.name}
                    >
                      <i style={{ background: p.light.bg }} />
                      <i style={{ background: p.light.accent }} />
                      <i style={{ background: p.dark.accent }} />
                      <span>{p.name}</span>
                    </button>
                    {user ? (
                      <button
                        type="button"
                        className={styles.x}
                        onClick={() => removePalette(user)}
                        disabled={busy}
                        aria-label={`${p.name} 팔레트 삭제`}
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                );
              })}
              {!palDraft && paletteSpecs.length < MAX_USER_PALETTES ? (
                <button
                  type="button"
                  className={styles.addBtn}
                  onClick={() =>
                    setPalDraft({
                      name: `내 팔레트 ${paletteSpecs.length + 1}`,
                      accent: SWATCHES[0]!,
                      tone: "neutral",
                    })
                  }
                >
                  + 내 팔레트
                </button>
              ) : null}
            </div>
          </div>
          {palDraft ? (
            <div className={styles.sub}>
              <label className={styles.field}>
                <span className={styles.label}>이름</span>
                <input
                  className={styles.input}
                  value={palDraft.name}
                  maxLength={20}
                  onChange={(e) => setPalDraft({ ...palDraft, name: e.target.value })}
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
                      data-on={palDraft.accent.toLowerCase() === c}
                      aria-label={c}
                      onClick={() => setPalDraft({ ...palDraft, accent: c })}
                    />
                  ))}
                  <input
                    type="color"
                    className={styles.colorInput}
                    value={HEX6.test(palDraft.accent) ? palDraft.accent : "#000000"}
                    onChange={(e) => setPalDraft({ ...palDraft, accent: e.target.value })}
                    aria-label="직접 고르기"
                  />
                  <input
                    className={`${styles.input} ${styles.hex}`}
                    value={palDraft.accent}
                    maxLength={7}
                    onChange={(e) => setPalDraft({ ...palDraft, accent: e.target.value.trim() })}
                    aria-label="hex"
                  />
                </div>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>배경 톤</span>
                <Seg
                  options={TONES.map((t) => [t, TONE_LABEL[t]])}
                  value={palDraft.tone}
                  onChange={(v) => setPalDraft({ ...palDraft, tone: v as Tone })}
                  label="배경 톤"
                />
              </div>
              <p className={styles.note}>
                강조색은 글자와 대비(4.5:1)가 모자라면 자동으로 진하게(다크에선 밝게) 맞춥니다.
              </p>
              <div className={styles.acts}>
                <button
                  type="button"
                  className={styles.textBtn}
                  onClick={() => setPalDraft(null)}
                  disabled={busy}
                >
                  취소
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={savePalette}
                  disabled={busy || !HEX6.test(palDraft.accent) || !palDraft.name.trim()}
                >
                  팔레트 저장
                </button>
              </div>
            </div>
          ) : null}

          <div className={styles.group}>모양</div>
          <div className={styles.field}>
            <span className={styles.label}>모서리</span>
            <Seg
              options={RADII.map((r) => [r, RADIUS_LABEL[r]])}
              value={draft.shape.radius}
              onChange={(v) =>
                setDraft({ ...draft, shape: { ...draft.shape, radius: v as Shape["radius"] } })
              }
              label="모서리"
            />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>버튼</span>
            <Seg
              options={BUTTONS.map((r) => [r, BUTTON_LABEL[r]])}
              value={draft.shape.button}
              onChange={(v) =>
                setDraft({ ...draft, shape: { ...draft.shape, button: v as Shape["button"] } })
              }
              label="버튼"
            />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>카드</span>
            <Seg
              options={CARDS.map((r) => [r, CARD_LABEL[r]])}
              value={draft.shape.card}
              onChange={(v) =>
                setDraft({ ...draft, shape: { ...draft.shape, card: v as Shape["card"] } })
              }
              label="카드"
            />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>패널</span>
            <Seg
              options={PANELS.map((r) => [r, PANEL_LABEL[r]])}
              value={draft.shape.panel}
              onChange={(v) =>
                setDraft({ ...draft, shape: { ...draft.shape, panel: v as Shape["panel"] } })
              }
              label="패널"
            />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>장식</span>
            <Seg
              options={[
                ["off", "끔"],
                ["on", "마스킹테이프"],
              ]}
              value={draft.shape.tape ? "on" : "off"}
              onChange={(v) => setDraft({ ...draft, shape: { ...draft.shape, tape: v === "on" } })}
              label="장식"
            />
          </div>

          <div className={styles.group}>이미지</div>
          {(["app", "band", "show"] as const).map((slot) => {
            const choice = draft.images[slot];
            const hasPreset = Boolean(presetTheme(draft.base)?.images[slot]);
            const kinds: [ImageKind, string][] = [
              ...(hasPreset ? ([["preset", "기본 그림"]] as [ImageKind, string][]) : []),
              ["none", "끔"],
              ["upload", "내 이미지"],
            ];
            const uploaded =
              choice.kind === "upload" ? assets.find((a) => a.id === choice.asset) : undefined;
            return (
              <div key={slot} className={styles.slot}>
                <div className={styles.field}>
                  <span className={styles.label}>{SLOT_LABEL[slot]}</span>
                  <Seg
                    options={kinds}
                    value={choice.kind}
                    onChange={(v) =>
                      setDraft(
                        setSlot(
                          draft,
                          slot,
                          v === "upload"
                            ? { kind: "upload", asset: choice.asset ?? assets[0]?.id }
                            : { kind: v as ImageKind },
                        ),
                      )
                    }
                    label={SLOT_LABEL[slot]}
                  />
                </div>
                {choice.kind === "upload" ? (
                  <AssetShelf
                    assets={assets}
                    current={choice.asset}
                    busy={busy}
                    onPick={(id) => setDraft(setSlot(draft, slot, { kind: "upload", asset: id }))}
                    onUpload={(f) => upload(f, slot)}
                    onRemove={removeAsset}
                  />
                ) : null}
                {slot === "app" && choice.kind !== "none" ? (
                  <>
                    <div className={styles.field}>
                      <span className={styles.label}>배치</span>
                      <Seg
                        options={FITS.map((f) => [f, FIT_LABEL[f]])}
                        value={draft.images.app.fit}
                        onChange={(v) =>
                          setDraft({
                            ...draft,
                            images: {
                              ...draft.images,
                              app: { ...draft.images.app, fit: v as AppImageChoice["fit"] },
                            },
                          })
                        }
                        label="배치"
                      />
                    </div>
                    <Range
                      label="흐림"
                      min={0}
                      max={16}
                      step={1}
                      value={draft.images.app.blur}
                      format={(v) => `${v}px`}
                      onChange={(v) =>
                        setDraft({
                          ...draft,
                          images: { ...draft.images, app: { ...draft.images.app, blur: v } },
                        })
                      }
                    />
                    <Range
                      label="바탕색 덮기"
                      min={0}
                      max={0.95}
                      step={0.05}
                      value={draft.images.app.dim}
                      format={(v) => `${Math.round(v * 100)}%`}
                      onChange={(v) =>
                        setDraft({
                          ...draft,
                          images: { ...draft.images, app: { ...draft.images.app, dim: v } },
                        })
                      }
                    />
                    {uploaded && minDimFor(uploaded.lum) > draft.images.app.dim ? (
                      <p className={styles.note}>
                        이 이미지는 어두워서 글자가 읽히도록 라이트에서 최소{" "}
                        {Math.round(minDimFor(uploaded.lum) * 100)}% 덮습니다.
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
            );
          })}

          <div className={styles.acts}>
            <button type="button" className={styles.textBtn} onClick={cancel} disabled={busy}>
              취소
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={saveDraft}
              disabled={busy || !draft.name.trim() || Boolean(palDraft)}
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
            disabled={busy || Boolean(draft)}
          >
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name}
              </option>
            ))}
          </select>
          <span className={styles.note}>
            공개 페이지 방문자에게 보이는 테마(라이트·다크는 방문자 OS). 첫 화면 그림만 보입니다.
          </span>
        </label>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}

function resolvePal(d: Draft, ctx: ResolveContext): string {
  return ctx.paletteExists(d.palette) ? d.palette : (presetTheme(d.base)?.palette ?? "default");
}

/** 편집 상태 → 저장할 내 테마(바탕 테마와 같은 값은 빼서 바탕 테마를 따라가게). */
function draftToSpec(d: Draft, id: string): ThemeSpec {
  const base = presetTheme(d.base) ?? PRESET_THEMES[0]!;
  const spec: ThemeSpec = { id, name: d.name.trim().slice(0, 20) || "내 테마", base: base.id };
  if (d.palette !== base.palette) spec.palette = d.palette;
  const shape: Partial<Shape> = {};
  for (const k of ["radius", "button", "card", "panel", "tape"] as const) {
    if (d.shape[k] !== base.shape[k]) (shape as Record<string, unknown>)[k] = d.shape[k];
  }
  if (Object.keys(shape).length) spec.shape = shape;
  const images: NonNullable<ThemeSpec["images"]> = {};
  const preset = base.images.app ?? { fit: "cover", blur: 0, dim: 0.2 };
  const a = d.images.app;
  const app: Partial<AppImageChoice> = {};
  if (a.kind !== "preset") {
    app.kind = a.kind;
    if (a.kind === "upload") app.asset = a.asset;
  }
  if (a.fit !== preset.fit || a.kind === "upload") app.fit = a.fit;
  if (a.blur !== preset.blur) app.blur = a.blur;
  if (a.dim !== preset.dim) app.dim = a.dim;
  if (Object.keys(app).length) images.app = app;
  if (d.images.band.kind !== "preset") images.band = d.images.band;
  if (d.images.show.kind !== "preset") images.show = d.images.show;
  if (Object.keys(images).length) spec.images = images;
  return spec;
}

function setSlot(d: Draft, slot: Slot, c: ImageChoice): Draft {
  const fixed: ImageChoice = c.kind === "upload" && !c.asset ? { kind: "upload" } : c;
  if (slot === "app")
    return {
      ...d,
      images: { ...d.images, app: { ...d.images.app, kind: fixed.kind, asset: fixed.asset } },
    };
  return { ...d, images: { ...d.images, [slot]: fixed } };
}

function clearAsset(d: Draft, id: string): Draft {
  let out = d;
  for (const slot of ["app", "band", "show"] as const) {
    const c = out.images[slot];
    if (c.kind === "upload" && c.asset === id)
      out = setSlot(out, slot, { kind: presetTheme(d.base)?.images[slot] ? "preset" : "none" });
  }
  return out;
}

function dropAsset(s: ThemeSpec, id: string): ThemeSpec {
  if (!s.images) return s;
  const im = { ...s.images };
  if (im.band?.asset === id) delete im.band;
  if (im.show?.asset === id) delete im.show;
  if (im.app?.asset === id) {
    const { kind: _k, asset: _a, ...rest } = im.app;
    void _k;
    void _a;
    im.app = Object.keys(rest).length ? rest : undefined;
  }
  return { ...s, images: im };
}

function Seg({
  options,
  value,
  onChange,
  label,
}: {
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div className={seg.seg} role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          className={seg.opt}
          data-on={value === v}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Range({
  label,
  min,
  max,
  step,
  value,
  format,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <span className={styles.range}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <output>{format(value)}</output>
      </span>
    </label>
  );
}

function AssetShelf({
  assets,
  current,
  busy,
  onPick,
  onUpload,
  onRemove,
}: {
  assets: ThemeAsset[];
  current?: string;
  busy: boolean;
  onPick: (id: string) => void;
  onUpload: (f: File) => void;
  onRemove: (a: ThemeAsset) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className={styles.shelf}>
      {assets.map((a) => (
        <span key={a.id} className={styles.thumbItem}>
          <button
            type="button"
            className={styles.thumb}
            data-on={current === a.id}
            onClick={() => onPick(a.id)}
            aria-label="이 이미지 쓰기"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={themeAssetUrl(a)} alt="" loading="lazy" />
          </button>
          <button
            type="button"
            className={styles.x}
            onClick={() => onRemove(a)}
            disabled={busy}
            aria-label="이미지 삭제"
          >
            ×
          </button>
        </span>
      ))}
      {assets.length < MAX_THEME_ASSETS ? (
        <>
          <button
            type="button"
            className={styles.upBtn}
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            + 이미지 올리기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onUpload(f);
            }}
          />
        </>
      ) : (
        <span className={styles.note}>이미지는 {MAX_THEME_ASSETS}장까지</span>
      )}
    </div>
  );
}
