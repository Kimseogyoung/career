// 색 팔레트 — 테마 커스텀의 단위(1단계: 구조만, 기본 팔레트 하나).
//
// 축이 둘이다.
//   모드(라이트/다크/시스템): 기기 취향. data-theme 속성, localStorage (theme.ts)
//   팔레트(어떤 색 조합인가): data-palette 속성. 팔레트마다 라이트판·다크판을 함께 가진다.
// 팔레트는 "기본 토큰"만 정한다. 나머지(옅은 배경, 그림자 등)는 globals.css 가 기본 토큰에서
// 파생하고, 화면 코드는 토큰만 쓴다 — 그래서 팔레트만 바꾸면 화면 전체가 따라온다.

export const PALETTE_TOKENS = [
  "bg", // 페이지 바탕
  "surface", // 카드·패널
  "surface-2", // 트랙·hover 바탕
  "border",
  "text",
  "text-muted",
  "accent", // 주 동작·선택·링크
  "accent-fg", // accent 위 글자
  "danger",
  "success",
  "warning",
  "star", // 대표(⭐) 표시
  "holiday", // 달력 일요일·공휴일
  "satblue", // 달력 토요일
] as const;

export type PaletteToken = (typeof PALETTE_TOKENS)[number];
export type PaletteColors = Record<PaletteToken, string>;

export interface Palette {
  id: string; // data-palette 값. 소문자·숫자·하이픈
  name: string;
  light: PaletteColors;
  dark: PaletteColors;
}

/** 차분한 모노 — 무채색 바탕 + 인디고 한 점. */
export const DEFAULT_PALETTE: Palette = {
  id: "default",
  name: "기본",
  light: {
    bg: "#f7f7f6",
    surface: "#ffffff",
    "surface-2": "#efefed",
    border: "#e4e4e0",
    text: "#17171a",
    "text-muted": "#6d6d68",
    accent: "#3b43c4",
    "accent-fg": "#ffffff",
    danger: "#b91c1c",
    success: "#1f7a4d",
    warning: "#a15c00",
    star: "#e0a500",
    holiday: "#d23b3b",
    satblue: "#2b6cb0",
  },
  dark: {
    bg: "#131316",
    surface: "#1b1b1f",
    "surface-2": "#212127",
    border: "#2c2c31",
    text: "#ededf0",
    "text-muted": "#9a9a95",
    accent: "#8b93ff",
    "accent-fg": "#15131c",
    danger: "#f87171",
    success: "#5fd39a",
    warning: "#f0b35a",
    star: "#e8b923",
    holiday: "#ff6b6b",
    satblue: "#6aa6ff",
  },
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** 팔레트 값은 <style> 로 그대로 들어간다. 사용자 정의 팔레트가 CSS 를 주입하지 못하게 hex·id 만 통과시킨다. */
export function isValidPalette(p: Palette): boolean {
  if (!ID.test(p.id)) return false;
  return PALETTE_TOKENS.every((t) => HEX.test(p.light[t] ?? "") && HEX.test(p.dark[t] ?? ""));
}

function decls(c: PaletteColors, scheme: "light" | "dark"): string {
  return `${PALETTE_TOKENS.map((t) => `--${t}:${c[t]}`).join(";")};color-scheme:${scheme}`;
}

/**
 * 팔레트 → CSS. 기본 팔레트는 :root 에, 나머지는 :root[data-palette=id] 에 건다.
 * 다크판은 OS 다크(수동 라이트가 아닐 때)와 수동 다크 두 곳에 같은 값으로 건다.
 * 선택자 구체성: 다른 팔레트의 라이트판(0,2,0)이 기본 다크(0,2,0)보다 뒤에 오고,
 * 그 팔레트의 다크판(0,3,0)은 자기 라이트판보다 높아서 순서·모드가 엉키지 않는다.
 */
export function paletteCss(p: Palette, isDefault = p.id === DEFAULT_PALETTE.id): string {
  if (!isValidPalette(p)) return "";
  const root = isDefault ? ":root" : `:root[data-palette="${p.id}"]`;
  const dark = decls(p.dark, "dark");
  return [
    `${root}{${decls(p.light, "light")}}`,
    `@media (prefers-color-scheme: dark){${root}:not([data-theme="light"]){${dark}}}`,
    `${root}[data-theme="dark"]{${dark}}`,
  ].join("\n");
}

// ── 팔레트 만들기(2단계): 강조색 + 배경 톤 → 팔레트 ─────────────────────
// 사용자는 이 두 가지만 고른다. 나머지 토큰은 톤 표와 기본 팔레트의 의미색에서 채우고,
// 강조색은 대비(WCAG 4.5:1)가 모자라면 밝기만 조정한다.

export const TONES = ["neutral", "warm", "cool", "pure"] as const;
export type Tone = (typeof TONES)[number];
export const TONE_LABEL: Record<Tone, string> = {
  neutral: "무채색",
  warm: "따뜻한 종이",
  cool: "차가운 회청",
  pure: "순백·순흑",
};

type Neutrals = Pick<PaletteColors, "bg" | "surface" | "surface-2" | "border" | "text" | "text-muted">;
const pickNeutrals = (c: PaletteColors): Neutrals => ({
  bg: c.bg,
  surface: c.surface,
  "surface-2": c["surface-2"],
  border: c.border,
  text: c.text,
  "text-muted": c["text-muted"],
});

const TONE_NEUTRALS: Record<Tone, { light: Neutrals; dark: Neutrals }> = {
  neutral: { light: pickNeutrals(DEFAULT_PALETTE.light), dark: pickNeutrals(DEFAULT_PALETTE.dark) },
  warm: {
    light: { bg: "#f6f1e7", surface: "#fffdf8", "surface-2": "#ede6d8", border: "#e2d9c6", text: "#2a2118", "text-muted": "#6f6352" },
    dark: { bg: "#17140f", surface: "#201c16", "surface-2": "#29241c", border: "#3a3328", text: "#efe7d8", "text-muted": "#a89c88" },
  },
  cool: {
    light: { bg: "#f3f6f9", surface: "#ffffff", "surface-2": "#e8edf3", border: "#dbe2ea", text: "#141a22", "text-muted": "#5f6b7a" },
    dark: { bg: "#0f1419", surface: "#161c23", "surface-2": "#1d242c", border: "#29323c", text: "#e6edf3", "text-muted": "#8f9baa" },
  },
  pure: {
    light: { bg: "#ffffff", surface: "#ffffff", "surface-2": "#f2f2f2", border: "#e0e0e0", text: "#111111", "text-muted": "#666666" },
    dark: { bg: "#000000", surface: "#0b0b0b", "surface-2": "#161616", border: "#262626", text: "#f0f0f0", "text-muted": "#9a9a9a" },
  },
};

// 색 계산: sRGB ↔ OKLCH(밝기만 바꿔도 색감이 유지됨), WCAG 대비.
type RGB = [number, number, number]; // 0..1

function hexToRgb(hex: string): RGB {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
}
function rgbToHex(c: RGB): string {
  return `#${c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("")}`;
}
const toLin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLin = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function rgbToOklch([r0, g0, b0]: RGB): [number, number, number] {
  const [r, g, b] = [toLin(r0), toLin(g0), toLin(b0)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}
function oklchToLinear(L: number, C: number, H: number): RGB {
  const A = C * Math.cos(H);
  const B = C * Math.sin(H);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
/** OKLCH → hex. sRGB 밖이면 채도를 줄여 맞춘다. */
function oklchToHex(L: number, C: number, H: number): string {
  let c = C;
  let lin = oklchToLinear(L, c, H);
  while (c > 0 && lin.some((v) => v < -1e-4 || v > 1 + 1e-4)) {
    c = Math.max(0, c - 0.005);
    lin = oklchToLinear(L, c, H);
  }
  return rgbToHex(lin.map(fromLin) as RGB);
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLin) as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG 대비(1~21). */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** 바탕 위에서 대비 min 이상이 될 때까지 강조색의 밝기만 옮긴다(어두운 바탕이면 밝게). */
function fitAccent(hex: string, against: string, min: number, darkBg: boolean): string {
  let [L, C] = rgbToOklch(hexToRgb(hex));
  const H = rgbToOklch(hexToRgb(hex))[2];
  if (darkBg) {
    L = Math.max(L, 0.72); // 어두운 바탕에선 너무 진한 강조색이 묻힌다
    C = Math.min(C, 0.17);
  }
  let out = oklchToHex(L, C, H);
  for (let i = 0; i < 100 && contrast(out, against) < min; i++) {
    L = darkBg ? Math.min(1, L + 0.01) : Math.max(0, L - 0.01);
    out = oklchToHex(L, C, H);
  }
  return out;
}
/** 강조색 위 글자: 흰색과 진한 색 중 대비가 큰 쪽. */
function onColor(bg: string, dark: string): string {
  return contrast("#ffffff", bg) >= contrast(dark, bg) ? "#ffffff" : dark;
}

/** 사용자 팔레트(settings.json). 토큰 전체가 아니라 만든 재료만 저장한다. */
export interface PaletteSpec {
  id: string; // "u-" + 소문자·숫자
  name: string;
  accent: string; // hex
  tone: Tone;
}

export function buildPalette(spec: PaletteSpec): Palette {
  const n = TONE_NEUTRALS[spec.tone];
  const la = fitAccent(spec.accent, n.light.surface, 4.5, false);
  const da = fitAccent(spec.accent, n.dark.surface, 4.5, true);
  return {
    id: spec.id,
    name: spec.name,
    light: { ...DEFAULT_PALETTE.light, ...n.light, accent: la, "accent-fg": onColor(la, "#111111") },
    dark: { ...DEFAULT_PALETTE.dark, ...n.dark, accent: da, "accent-fg": onColor(da, n.dark.bg) },
  };
}

/** 고대비: 글자·테두리·의미색을 모두 진하게(밝게). 톤 표로 못 만들어 직접 정한다. */
const HIGH_CONTRAST: Palette = {
  id: "contrast",
  name: "고대비",
  light: {
    bg: "#ffffff",
    surface: "#ffffff",
    "surface-2": "#ebebeb",
    border: "#8a8a8a",
    text: "#000000",
    "text-muted": "#3d3d3d",
    accent: "#0038b8",
    "accent-fg": "#ffffff",
    danger: "#a00000",
    success: "#0b5d33",
    warning: "#7a4100",
    star: "#b07d00",
    holiday: "#b00000",
    satblue: "#0040a0",
  },
  dark: {
    bg: "#000000",
    surface: "#000000",
    "surface-2": "#1a1a1a",
    border: "#9a9a9a",
    text: "#ffffff",
    "text-muted": "#d0d0d0",
    accent: "#9cc2ff",
    "accent-fg": "#000000",
    danger: "#ff8080",
    success: "#6ee7a8",
    warning: "#ffc266",
    star: "#ffd23f",
    holiday: "#ff8a8a",
    satblue: "#8cbcff",
  },
};

/** 기본 제공 팔레트. id 는 사용자 팔레트("u-…")와 겹치지 않는다. */
export const PRESET_PALETTES: Palette[] = [
  DEFAULT_PALETTE,
  buildPalette({ id: "paper", name: "종이", accent: "#9a4f1e", tone: "warm" }),
  buildPalette({ id: "sea", name: "바다", accent: "#0f766e", tone: "cool" }),
  buildPalette({ id: "ink", name: "먹(OLED)", accent: DEFAULT_PALETTE.light.accent, tone: "pure" }),
  HIGH_CONTRAST,
];

export const MAX_USER_PALETTES = 6;
const USER_ID = /^u-[a-z0-9]{1,12}$/;

function normHex(v: unknown): string | null {
  if (typeof v !== "string" || !HEX.test(v.trim())) return null;
  const h = v.trim().toLowerCase();
  return h.length === 4 ? `#${[...h.slice(1)].map((c) => c + c).join("")}` : h;
}

/** settings.json 의 palettes 를 검증한다. 잘못된 항목은 버리고, id 중복은 앞의 것만. */
export function sanitizePaletteSpecs(raw: unknown): PaletteSpec[] {
  if (!Array.isArray(raw)) return [];
  const out: PaletteSpec[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const accent = normHex(o.accent);
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 20) : "";
    if (!USER_ID.test(id) || seen.has(id) || !accent || !name) continue;
    if (!TONES.includes(o.tone as Tone)) continue;
    seen.add(id);
    out.push({ id, name, accent, tone: o.tone as Tone });
    if (out.length >= MAX_USER_PALETTES) break;
  }
  return out;
}

/** 프리셋 + 사용자 팔레트. */
export function allPalettes(specs: PaletteSpec[]): Palette[] {
  return [...PRESET_PALETTES, ...specs.map(buildPalette)];
}

/** 팔레트 id 검증 — 없는 id 면 기본. */
export function resolvePaletteId(id: unknown, specs: PaletteSpec[]): string {
  return typeof id === "string" && allPalettes(specs).some((p) => p.id === id) ? id : DEFAULT_PALETTE.id;
}

export function newUserPaletteId(): string {
  return `u-${Date.now().toString(36).slice(-6)}${Math.floor(Math.random() * 46656).toString(36)}`;
}
