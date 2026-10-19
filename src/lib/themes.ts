// 테마 = 팔레트 + 모양 + 이미지 (ADR-018 T-3).
//
// 기본 테마(서버에 포함)를 고르고, 항목별로 바꾼 것을 "내 테마"로 저장한다. 내 테마는 바탕 테마 id 와
// 바꾼 값만 settings.json 에 둔다 — 그래서 기본 테마를 다듬으면 내 테마에도 따라온다.
// 어떤 테마를 쓸지는 기기별(localStorage, data-tid). 테마는 자기 팔레트 id 를 data-palette 로 건다.
//
// 테마 값도 <style> 로 그대로 들어가므로, 사용자 입력은 열거값·숫자·정해진 형식의 id 만 통과시킨다.
// 자유 문자열(rgba·그라데이션)은 서버 코드에 있는 기본 테마에서만 나온다.

import { DEFAULT_PALETTE, allPalettes, paletteCss, type PaletteSpec } from "./palette";

export const RADII = ["none", "small", "medium", "large", "full"] as const;
export const BUTTONS = ["solid", "soft", "outline", "text"] as const;
export const CARDS = ["line", "float", "sticker"] as const;
export const PANELS = ["solid", "glass"] as const;
export const FITS = ["tile", "cover"] as const;
export const IMAGE_KINDS = ["preset", "none", "upload"] as const;

export type Radius = (typeof RADII)[number];
export type ButtonStyle = (typeof BUTTONS)[number];
export type CardStyle = (typeof CARDS)[number];
export type PanelStyle = (typeof PANELS)[number];
export type Fit = (typeof FITS)[number];
export type ImageKind = (typeof IMAGE_KINDS)[number];

export const RADIUS_LABEL: Record<Radius, string> = {
  none: "각짐",
  small: "작게",
  medium: "보통",
  large: "크게",
  full: "알약",
};
export const BUTTON_LABEL: Record<ButtonStyle, string> = {
  solid: "채움",
  soft: "옅은 색",
  outline: "테두리",
  text: "글자만",
};
export const CARD_LABEL: Record<CardStyle, string> = {
  line: "선",
  float: "떠 있음",
  sticker: "스티커",
};
export const PANEL_LABEL: Record<PanelStyle, string> = { solid: "불투명", glass: "반투명" };
export const FIT_LABEL: Record<Fit, string> = { tile: "바둑판", cover: "채우기" };

export interface Shape {
  radius: Radius;
  button: ButtonStyle;
  card: CardStyle;
  panel: PanelStyle;
  tape: boolean; // 마스킹테이프 장식(일 보기 첫 기록·Showcase 첫 화면)
}

export interface ImageChoice {
  kind: ImageKind; // preset: 바탕 테마의 그림, none: 끔, upload: 올린 이미지
  asset?: string; // kind=upload 일 때 ThemeAsset.id
}
export interface AppImageChoice extends ImageChoice {
  fit: Fit;
  blur: number; // 0..16 px
  dim: number; // 0..0.95 — 바탕색으로 덮는 정도(라이트). 다크는 globals 의 --dk 로 더 덮는다.
}
export interface ThemeImageChoices {
  app: AppImageChoice;
  band: ImageChoice;
  show: ImageChoice;
}

/** 테마 장식 토큰(모드별). 팔레트 밖의 값이라 테마가 정한다. */
interface Extras {
  glass: string; // 반투명 패널 바탕
  ink: string; // 스티커 카드 테두리
  sticker: string; // 스티커 카드 그림자
  tape: string; // 마스킹테이프 채움(그라데이션 가능)
  bandWash: number; // 머리줄·Showcase 그림을 바탕색으로 덮는 정도
}

/** 기본 테마. 그림 파일은 public/themes/ 에 있다(앱 이미지에 포함). */
export interface PresetTheme {
  id: string;
  name: string;
  tag: string;
  palette: string;
  shape: Shape;
  /** app 의 fit·blur·dim 은 이 그림에 맞춘 값. tile 이면 size(px) 로 반복. */
  images: {
    app?: { fit: Fit; blur: number; dim: number; size?: number };
    band?: true;
    show?: true;
  };
  extras?: { light?: Partial<Extras>; dark?: Partial<Extras> };
}

/** 내 테마(settings.json). 바탕 테마 + 바꾼 값만. */
export interface ThemeSpec {
  id: string; // "t-" + 소문자·숫자
  name: string;
  base: string; // PresetTheme.id
  palette?: string;
  shape?: Partial<Shape>;
  images?: { app?: Partial<AppImageChoice>; band?: ImageChoice; show?: ImageChoice };
}

/** 올린 테마 이미지(settings.json 에 등록, 파일은 career-db meta/theme/). */
export interface ThemeAsset {
  id: string;
  ext: "webp" | "jpg" | "png";
  width: number;
  height: number;
  bytes: number;
  lum: number; // 0..1 평균 밝기 — 라이트에서 덮기 최소값을 정한다
}

const BASE_SHAPE: Shape = {
  radius: "medium",
  button: "solid",
  card: "line",
  panel: "solid",
  tape: false,
};

export const DEFAULT_THEME_ID = "default";

const GINGHAM = (line: string, base: string) =>
  `repeating-linear-gradient(0deg,rgb(0 0 0 / 0) 0 4px,${line} 4px 8px),repeating-linear-gradient(90deg,${line} 0 4px,${base} 4px 8px)`;

export const PRESET_THEMES: PresetTheme[] = [
  {
    id: DEFAULT_THEME_ID,
    name: "기본",
    tag: "그림 없이 차분하게",
    palette: DEFAULT_PALETTE.id,
    shape: BASE_SHAPE,
    images: {},
  },
  {
    id: "wc",
    name: "수채 다이어리",
    tag: "번진 물감 · 점 모눈 종이",
    palette: "wc",
    shape: { radius: "large", button: "soft", card: "float", panel: "solid", tape: true },
    images: { app: { fit: "cover", blur: 0, dim: 0.15 }, band: true, show: true },
    extras: {
      light: {
        glass: "rgb(255 254 252 / .84)",
        ink: "#2e2a2b",
        sticker: "#e8d6dc",
        tape: "rgb(168 188 160 / .55)",
      },
      dark: {
        glass: "rgb(38 35 36 / .84)",
        ink: "#e3a6bd",
        sticker: "#4a3640",
        tape: "rgb(150 170 145 / .45)",
        bandWash: 0.45,
      },
    },
  },
  {
    id: "sky",
    name: "하늘 별",
    tag: "보송한 별 · 크레파스 낙서",
    palette: "sky",
    shape: { radius: "large", button: "soft", card: "float", panel: "solid", tape: true },
    images: { app: { fit: "cover", blur: 0, dim: 0.2 }, band: true, show: true },
    extras: {
      light: {
        glass: "rgb(255 255 255 / .85)",
        ink: "#2f6fa3",
        sticker: "#cfe4f3",
        tape: GINGHAM("rgb(140 190 230 / .45)", "rgb(240 248 255 / .9)"),
      },
      dark: {
        glass: "rgb(23 37 50 / .85)",
        ink: "#8cc8f0",
        sticker: "#22384b",
        tape: GINGHAM("rgb(140 200 240 / .3)", "rgb(30 50 68 / .9)"),
        bandWash: 0.4,
      },
    },
  },
  {
    id: "ceramic",
    name: "도자기 참",
    tag: "유약 바른 참 · 광택",
    palette: "ceramic",
    shape: { radius: "full", button: "soft", card: "float", panel: "solid", tape: false },
    // 참 그림이 또렷해 제목 글자와 겹치면 거슬린다 — 시안(35%)보다 조금 더 덮는다.
    images: { app: { fit: "cover", blur: 0, dim: 0.45 }, band: true, show: true },
    extras: {
      light: { glass: "rgb(255 255 255 / .86)", ink: "#3b5aa6", sticker: "#dfe7f3" },
      dark: { glass: "rgb(27 34 48 / .86)", ink: "#9fb8f0", sticker: "#2a3550", bandWash: 0.5 },
    },
  },
  {
    id: "modern",
    name: "모던",
    tag: "추상 사진 · 반투명 패널",
    palette: "modern",
    shape: { radius: "small", button: "solid", card: "line", panel: "glass", tape: false },
    images: { app: { fit: "cover", blur: 0, dim: 0.12 }, band: true, show: true },
    extras: {
      light: { glass: "rgb(255 255 255 / .74)" },
      dark: { glass: "rgb(22 24 29 / .72)", bandWash: 0.25 },
    },
  },
  {
    id: "film",
    name: "필름",
    tag: "노을 사진 · 각진 인화지",
    palette: "film",
    shape: { radius: "none", button: "solid", card: "line", panel: "solid", tape: false },
    images: { app: { fit: "cover", blur: 0, dim: 0.2 }, band: true, show: true },
    extras: { dark: { bandWash: 0.35 } },
  },
  {
    id: "forest",
    name: "숲",
    tag: "잎사귀 · 둥근 유리 패널",
    palette: "forest",
    shape: { radius: "full", button: "solid", card: "float", panel: "glass", tape: false },
    images: { app: { fit: "cover", blur: 8, dim: 0.3 }, band: true, show: true },
    extras: {
      light: { glass: "rgb(255 255 255 / .76)" },
      dark: { glass: "rgb(21 32 25 / .74)", bandWash: 0.3 },
    },
  },
  {
    id: "night",
    name: "밤하늘",
    tag: "별자리 · 금빛 테두리",
    palette: "night",
    shape: { radius: "medium", button: "outline", card: "line", panel: "glass", tape: false },
    images: { app: { fit: "cover", blur: 0, dim: 0.65 }, band: true, show: true },
    extras: {
      light: { glass: "rgb(255 255 255 / .82)" },
      dark: { glass: "rgb(18 21 48 / .7)", bandWash: 0.2 },
    },
  },
];

const PRESET_BY_ID = new Map(PRESET_THEMES.map((t) => [t.id, t]));
export function presetTheme(id: string): PresetTheme | undefined {
  return PRESET_BY_ID.get(id);
}

export function presetImageUrl(themeId: string, slot: "app" | "band" | "show"): string {
  return `/themes/${themeId}-${slot}.webp`;
}

// ── 검증 ─────────────────────────────────────────────────────────

export const MAX_USER_THEMES = 8;
export const MAX_THEME_ASSETS = 12;
// 올린 이미지: 브라우저에서 긴 변 1920px webp 로 줄인다(보통 200~400KB). nginx 기본 1MB 안쪽.
export const THEME_BYTES_MAX = 600 * 1024;
export const THEME_LONG_EDGE = 1920;
const USER_THEME_ID = /^t-[a-z0-9]{1,12}$/;
const ASSET_ID = /^[0-9A-Za-z]{10,40}$/;
const PALETTE_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function isThemeAssetId(id: unknown): id is string {
  return typeof id === "string" && ASSET_ID.test(id);
}

const pick = <T extends string>(list: readonly T[], v: unknown): T | undefined =>
  list.includes(v as T) ? (v as T) : undefined;
const num = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;

function sanitizeShape(v: unknown): Partial<Shape> | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const out: Partial<Shape> = {};
  const r = pick(RADII, o.radius);
  const b = pick(BUTTONS, o.button);
  const c = pick(CARDS, o.card);
  const p = pick(PANELS, o.panel);
  if (r) out.radius = r;
  if (b) out.button = b;
  if (c) out.card = c;
  if (p) out.panel = p;
  if (typeof o.tape === "boolean") out.tape = o.tape;
  return Object.keys(out).length ? out : undefined;
}

function sanitizeChoice(v: unknown): ImageChoice | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const kind = pick(IMAGE_KINDS, o.kind);
  if (!kind) return undefined;
  if (kind === "upload") return isThemeAssetId(o.asset) ? { kind, asset: o.asset } : undefined;
  return { kind };
}

function sanitizeApp(v: unknown): Partial<AppImageChoice> | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const out: Partial<AppImageChoice> = { ...(sanitizeChoice(v) ?? {}) };
  const fit = pick(FITS, o.fit);
  const blur = num(o.blur, 0, 16);
  const dim = num(o.dim, 0, 0.95);
  if (fit) out.fit = fit;
  if (blur !== undefined) out.blur = Math.round(blur);
  if (dim !== undefined) out.dim = Math.round(dim * 100) / 100;
  return Object.keys(out).length ? out : undefined;
}

/** settings.json 의 themes 검증. 잘못된 항목은 버리고 id 중복은 앞의 것만. */
export function sanitizeThemeSpecs(raw: unknown): ThemeSpec[] {
  if (!Array.isArray(raw)) return [];
  const out: ThemeSpec[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 20) : "";
    const base = typeof o.base === "string" && PRESET_BY_ID.has(o.base) ? o.base : "";
    if (!USER_THEME_ID.test(id) || seen.has(id) || !name || !base) continue;
    seen.add(id);
    const spec: ThemeSpec = { id, name, base };
    if (typeof o.palette === "string" && PALETTE_ID.test(o.palette)) spec.palette = o.palette;
    const shape = sanitizeShape(o.shape);
    if (shape) spec.shape = shape;
    if (o.images && typeof o.images === "object") {
      const im = o.images as Record<string, unknown>;
      const images: ThemeSpec["images"] = {};
      const app = sanitizeApp(im.app);
      const band = sanitizeChoice(im.band);
      const show = sanitizeChoice(im.show);
      if (app) images.app = app;
      if (band) images.band = band;
      if (show) images.show = show;
      if (Object.keys(images).length) spec.images = images;
    }
    out.push(spec);
    if (out.length >= MAX_USER_THEMES) break;
  }
  return out;
}

export function sanitizeThemeAssets(raw: unknown): ThemeAsset[] {
  if (!Array.isArray(raw)) return [];
  const out: ThemeAsset[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const ext = pick(["webp", "jpg", "png"] as const, o.ext);
    if (!isThemeAssetId(o.id) || seen.has(o.id) || !ext) continue;
    seen.add(o.id);
    out.push({
      id: o.id,
      ext,
      width: Math.round(num(o.width, 1, 10000) ?? 1),
      height: Math.round(num(o.height, 1, 10000) ?? 1),
      bytes: Math.round(num(o.bytes, 0, 10_000_000) ?? 0),
      lum: num(o.lum, 0, 1) ?? 0.5,
    });
    if (out.length >= MAX_THEME_ASSETS) break;
  }
  return out;
}

/** 등록되지 않은 이미지를 가리키는 칸은 바탕 테마 그림으로 되돌린다. */
export function dropUnknownAssets(specs: ThemeSpec[], assetIds: Set<string>): ThemeSpec[] {
  const fix = <T extends Partial<ImageChoice>>(c: T | undefined): T | undefined =>
    c?.kind === "upload" && !(c.asset && assetIds.has(c.asset)) ? undefined : c;
  return specs.map((s) => {
    if (!s.images) return s;
    const app = s.images.app;
    const images = {
      app:
        app?.kind === "upload" && !(app.asset && assetIds.has(app.asset))
          ? { ...app, kind: undefined, asset: undefined }
          : app,
      band: fix(s.images.band),
      show: fix(s.images.show),
    };
    if (images.app && images.app.kind === undefined) {
      const { kind: _k, asset: _a, ...rest } = images.app;
      void _k;
      void _a;
      images.app = Object.keys(rest).length ? rest : undefined;
    }
    const kept = Object.fromEntries(Object.entries(images).filter(([, v]) => v !== undefined));
    const { images: _old, ...rest } = s;
    void _old;
    return Object.keys(kept).length ? { ...rest, images: kept } : rest;
  });
}

export function newUserThemeId(): string {
  return `t-${Date.now().toString(36).slice(-6)}${Math.floor(Math.random() * 46656).toString(36)}`;
}

// ── 해석: 바탕 테마 + 바꾼 값 → 실제로 그릴 값 ────────────────────────

export interface ResolvedTheme {
  id: string;
  name: string;
  palette: string;
  shape: Shape;
  app: { url: string; fit: Fit; blur: number; dim: number; size: number } | null;
  band: string | null;
  show: string | null;
  extras: { light: Partial<Extras>; dark: Partial<Extras> };
}

export interface ResolveContext {
  specs: ThemeSpec[];
  assets: ThemeAsset[];
  paletteExists: (id: string) => boolean;
  /** 올린 이미지 주소. 앱(로그인)과 공개 Showcase 가 다르다. */
  assetUrl: (asset: ThemeAsset) => string;
}

/** 라이트에서 이미지 위 글자가 읽히도록 덮기 최소값: 어두운 이미지일수록 더 덮는다. */
export function minDimFor(lum: number): number {
  return Math.round(Math.min(0.85, Math.max(0, 0.8 - lum)) * 100) / 100;
}

/** 테마 id → 실제 값. 없는 id 면 기본 테마. */
export function resolveTheme(id: string, ctx: ResolveContext): ResolvedTheme {
  const spec = ctx.specs.find((s) => s.id === id);
  const base = presetTheme(spec?.base ?? id) ?? PRESET_THEMES[0]!;
  const assetById = new Map(ctx.assets.map((a) => [a.id, a]));

  const palette = spec?.palette && ctx.paletteExists(spec.palette) ? spec.palette : base.palette;
  const shape: Shape = { ...base.shape, ...spec?.shape };

  const slot = (
    choice: ImageChoice | undefined,
    slotName: "app" | "band" | "show",
  ): { url: string; asset?: ThemeAsset } | null => {
    const kind = choice?.kind ?? "preset";
    if (kind === "none") return null;
    if (kind === "upload") {
      const a = choice?.asset ? assetById.get(choice.asset) : undefined;
      return a ? { url: ctx.assetUrl(a), asset: a } : null;
    }
    const has = slotName === "app" ? Boolean(base.images.app) : Boolean(base.images[slotName]);
    return has ? { url: presetImageUrl(base.id, slotName) } : null;
  };

  const appChoice = spec?.images?.app;
  const appSlot = slot(appChoice?.kind ? (appChoice as ImageChoice) : undefined, "app");
  let app: ResolvedTheme["app"] = null;
  if (appSlot) {
    const preset = base.images.app ?? { fit: "cover" as Fit, blur: 0, dim: 0.2 };
    const uploaded = Boolean(appSlot.asset);
    const fit = appChoice?.fit ?? (uploaded ? "cover" : preset.fit);
    const dim = appChoice?.dim ?? (uploaded ? 0.2 : preset.dim);
    app = {
      url: appSlot.url,
      fit,
      blur: appChoice?.blur ?? (uploaded ? 0 : preset.blur),
      dim: appSlot.asset ? Math.max(dim, minDimFor(appSlot.asset.lum)) : dim,
      size: preset.size ?? 240,
    };
  }

  // 팔레트를 바꿨으면 바탕 테마의 장식 색은 어울리지 않으니 팔레트에서 파생한 기본값을 쓴다(bandWash 는 유지).
  const keepExtras = palette === base.palette;
  const ex = base.extras ?? {};
  const extras = keepExtras
    ? { light: ex.light ?? {}, dark: ex.dark ?? {} }
    : { light: { bandWash: ex.light?.bandWash }, dark: { bandWash: ex.dark?.bandWash } };

  return {
    id: spec?.id ?? base.id,
    name: spec?.name ?? base.name,
    palette,
    shape,
    app,
    band: slot(spec?.images?.band, "band")?.url ?? null,
    show: slot(spec?.images?.show, "show")?.url ?? null,
    extras,
  };
}

// ── CSS ─────────────────────────────────────────────────────────

const RADIUS_K: Record<Radius, [ctl: number, card: number, pill: number]> = {
  none: [0, 0, 0],
  small: [0.6, 0.55, 1],
  medium: [1, 1, 1],
  large: [1.5, 1.45, 1],
  full: [4, 1.9, 1],
};

const BUTTON_TOKENS: Record<ButtonStyle, Record<string, string>> = {
  solid: { "btn-bg": "var(--accent)", "btn-fg": "var(--accent-fg)", "btn-ring": "0 0 #0000" },
  soft: {
    "btn-bg": "color-mix(in srgb, var(--accent) 15%, var(--surface))",
    "btn-fg": "var(--accent-ink)",
    "btn-ring": "0 0 #0000",
  },
  outline: {
    "btn-bg": "transparent",
    "btn-fg": "var(--accent-ink)",
    "btn-ring": "inset 0 0 0 1.5px var(--accent)",
  },
  text: { "btn-bg": "transparent", "btn-fg": "var(--accent-ink)", "btn-ring": "0 0 #0000" },
};

const CARD_TOKENS: Record<CardStyle, Record<string, string>> = {
  line: { "card-bw": "1px", "card-bc": "var(--border)", "card-shadow": "none" },
  float: {
    "card-bw": "1px",
    "card-bc": "transparent",
    "card-shadow": "0 1px 2px rgb(0 0 0 / .05), 0 6px 18px rgb(0 0 0 / .07)",
  },
  sticker: {
    "card-bw": "1.5px",
    "card-bc": "var(--ink)",
    "card-shadow": "3px 3px 0 var(--sticker)",
  },
};

const PANEL_TOKENS: Record<PanelStyle, Record<string, string>> = {
  solid: { "card-bg": "var(--surface)", "card-blur": "none" },
  glass: { "card-bg": "var(--glass)", "card-blur": "blur(10px)" },
};

const DERIVED_EXTRAS: Record<keyof Omit<Extras, "bandWash">, string> = {
  glass: "color-mix(in srgb, var(--surface) 80%, transparent)",
  ink: "color-mix(in srgb, var(--accent) 55%, var(--border))",
  sticker: "color-mix(in srgb, var(--accent) 22%, var(--surface))",
  tape: "color-mix(in srgb, var(--accent) 28%, transparent)",
};

const URL_SAFE = /^\/[A-Za-z0-9/_.-]+$/; // CSS url("…") 안에 들어가도 안전한 경로만

function cssUrl(u: string | null): string {
  return u && URL_SAFE.test(u) ? `url("${u}")` : "none";
}

function extrasDecls(e: Partial<Extras>, fallbackWash: number): string {
  const v = {
    ...DERIVED_EXTRAS,
    ...Object.fromEntries(Object.entries(e).filter(([k, x]) => k !== "bandWash" && x)),
  };
  return [
    ...Object.entries(v).map(([k, x]) => `--${k}:${x}`),
    `--band-wash:${e.bandWash ?? fallbackWash}`,
  ].join(";");
}

/**
 * 테마 → CSS. 기본 테마는 :root, 나머지는 :root[data-tid=id] (팔레트와 같은 구체성 규칙 — paletteCss 참고).
 * selectorId 로 다른 id 에 걸 수 있다(공개 Showcase 용 "showcase").
 */
export function themeCss(t: ResolvedTheme, selectorId = t.id): string {
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(selectorId)) return "";
  const root = selectorId === DEFAULT_THEME_ID ? ":root" : `:root[data-tid="${selectorId}"]`;
  const [kc, kk, kp] = RADIUS_K[t.shape.radius];
  const tokens: Record<string, string> = {
    "rk-ctl": String(kc),
    "rk-card": String(kk),
    "rk-pill": String(kp),
    ...BUTTON_TOKENS[t.shape.button],
    ...CARD_TOKENS[t.shape.card],
    ...PANEL_TOKENS[t.shape.panel],
    "tape-display": t.shape.tape ? "block" : "none",
    "app-img": cssUrl(t.app?.url ?? null),
    "app-size": t.app ? (t.app.fit === "tile" ? `${t.app.size}px` : "cover") : "auto",
    "app-repeat": t.app?.fit === "tile" ? "repeat" : "no-repeat",
    "app-blur": `${t.app?.blur ?? 0}px`,
    "app-dim": String(t.app?.dim ?? 0),
    "band-img": cssUrl(t.band),
    "band-on": t.band ? "1" : "0",
    "show-img": cssUrl(t.show),
    "show-on": t.show ? "1" : "0",
  };
  const light = `${Object.entries(tokens)
    .map(([k, v]) => `--${k}:${v}`)
    .join(";")};${extrasDecls(t.extras.light, 0)}`;
  const dark = extrasDecls(t.extras.dark, 0.35);
  return [
    `${root}{${light}}`,
    `@media (prefers-color-scheme: dark){${root}:not([data-theme="light"]){${dark}}}`,
    `${root}[data-theme="dark"]{${dark}}`,
  ].join("\n");
}

export const SHOWCASE_TID = "showcase"; // 공개 Showcase 전용 선택자(기기 선택과 무관)

export const themeAssetUrl = (a: ThemeAsset) => `/api/theme-assets/${a.id}`;
export const publicThemeAssetUrl = (a: ThemeAsset) => `/showcase/theme-assets/${a.id}`;

export interface ThemeInputs {
  paletteSpecs: PaletteSpec[];
  themeSpecs: ThemeSpec[];
  assets: ThemeAsset[];
  showcaseTheme?: string;
}

export interface ThemeBundle {
  css: string;
  /** 테마 id → 팔레트 id. 초기화 스크립트가 data-palette 를 함께 건다. */
  paletteOf: Record<string, string>;
  showcasePalette: string;
}

/** 레이아웃이 넣는 테마 전체: 팔레트 CSS + 테마 CSS(기본·내 테마) + 공개 Showcase 테마. */
export function themeBundle(inp: ThemeInputs): ThemeBundle {
  const palettes = allPalettes(inp.paletteSpecs);
  const ids = new Set(palettes.map((p) => p.id));
  const ctx = (assetUrl: ResolveContext["assetUrl"]): ResolveContext => ({
    specs: inp.themeSpecs,
    assets: inp.assets,
    paletteExists: (id) => ids.has(id),
    assetUrl,
  });
  const app = ctx(themeAssetUrl);
  const paletteOf: Record<string, string> = {};
  const parts = palettes.map((p) => paletteCss(p));
  for (const id of allThemeIds(inp.themeSpecs)) {
    const t = resolveTheme(id, app);
    paletteOf[id] = t.palette;
    parts.push(themeCss(t));
  }
  const sc = resolveTheme(
    resolveThemeId(inp.showcaseTheme, inp.themeSpecs),
    ctx(publicThemeAssetUrl),
  );
  parts.push(themeCss(sc, SHOWCASE_TID));
  paletteOf[SHOWCASE_TID] = sc.palette;
  return { css: parts.join("\n"), paletteOf, showcasePalette: sc.palette };
}

/** 공개 경로로 내보내도 되는 이미지: 공개 Showcase 테마가 쓰는 것만. */
export function publicAssetIds(inp: ThemeInputs): Set<string> {
  const id = resolveThemeId(inp.showcaseTheme, inp.themeSpecs);
  const spec = inp.themeSpecs.find((s) => s.id === id);
  const out = new Set<string>();
  // Showcase 에서는 첫 화면 그림만 보인다(앱 바탕·머리줄은 숨김).
  const c = spec?.images?.show;
  if (c?.kind === "upload" && c.asset) out.add(c.asset);
  return out;
}

/** 기본 테마 + 내 테마 id 목록. */
export function allThemeIds(specs: ThemeSpec[]): string[] {
  return [...PRESET_THEMES.map((t) => t.id), ...specs.map((s) => s.id)];
}

export function resolveThemeId(id: unknown, specs: ThemeSpec[]): string {
  return typeof id === "string" && allThemeIds(specs).includes(id) ? id : DEFAULT_THEME_ID;
}
