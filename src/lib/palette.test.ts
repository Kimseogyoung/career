import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PALETTE,
  MAX_USER_PALETTES,
  PALETTE_TOKENS,
  PRESET_PALETTES,
  TONES,
  buildPalette,
  contrast,
  isValidPalette,
  paletteCss,
  resolvePaletteId,
  sanitizePaletteSpecs,
  type Palette,
} from "./palette";

test("팔레트: 기본 팔레트는 모든 토큰을 라이트·다크 모두 갖는다", () => {
  assert.ok(isValidPalette(DEFAULT_PALETTE));
  for (const t of PALETTE_TOKENS) {
    assert.ok(paletteCss(DEFAULT_PALETTE).includes(`--${t}:${DEFAULT_PALETTE.light[t]}`), t);
  }
});

test("팔레트: 기본은 :root, 그 밖은 data-palette 에 걸리고 다크판은 OS 다크·수동 다크 두 곳", () => {
  const def = paletteCss(DEFAULT_PALETTE);
  assert.match(def, /^:root\{/);
  assert.match(def, /:root:not\(\[data-theme="light"\]\)\{[^}]*color-scheme:dark/);
  assert.match(def, /:root\[data-theme="dark"\]\{[^}]*color-scheme:dark/);

  const paper: Palette = { ...DEFAULT_PALETTE, id: "paper", name: "종이" };
  const css = paletteCss(paper);
  assert.match(css, /^:root\[data-palette="paper"\]\{/);
  assert.match(css, /:root\[data-palette="paper"\]\[data-theme="dark"\]\{/);
  assert.match(css, /:root\[data-palette="paper"\]:not\(\[data-theme="light"\]\)\{/);
});

test("팔레트: hex 가 아닌 값·이상한 id 는 CSS 로 내보내지 않는다(주입 방지)", () => {
  const evil = { ...DEFAULT_PALETTE, id: "x", light: { ...DEFAULT_PALETTE.light, bg: "red;}body{display:none" } };
  assert.equal(paletteCss(evil), "");
  assert.equal(paletteCss({ ...DEFAULT_PALETTE, id: 'a"]{}' }), "");
  assert.equal(paletteCss({ ...DEFAULT_PALETTE, id: "Paper" }), "");
  const missing = { ...DEFAULT_PALETTE, id: "y", dark: { ...DEFAULT_PALETTE.dark, star: "" } };
  assert.equal(paletteCss(missing), "");
});

test("팔레트 만들기: 프리셋·임의 강조색 모두 글자·강조색 대비 4.5:1 이상", () => {
  const specs = ["#3b43c4", "#ffff00", "#ffffff", "#000000", "#ff0000", "#00ff00", "#9a4f1e", "#7c3aed"].flatMap((accent) =>
    TONES.map((tone) => buildPalette({ id: "u-t", name: "t", accent, tone })),
  );
  for (const p of [...PRESET_PALETTES, ...specs]) {
    assert.ok(isValidPalette(p), p.id);
    for (const mode of ["light", "dark"] as const) {
      const c = p[mode];
      const tag = `${p.id}/${mode}/${c.accent}`;
      assert.ok(contrast(c.text, c.bg) >= 7, `글자 ${tag}`);
      assert.ok(contrast(c["text-muted"], c.bg) >= 4.5, `흐린 글자 ${tag}`);
      assert.ok(contrast(c.accent, c.surface) >= 4.5, `강조 ${tag}`);
      assert.ok(contrast(c["accent-fg"], c.accent) >= 4.5, `강조 위 글자 ${tag}`);
    }
  }
});

test("팔레트 만들기: 이미 대비가 충분한 강조색은 라이트에서 그대로 쓴다", () => {
  const p = buildPalette({ id: "u-a", name: "a", accent: "#3b43c4", tone: "neutral" });
  assert.equal(p.light.accent, "#3b43c4");
  assert.equal(p.light.bg, DEFAULT_PALETTE.light.bg);
});

test("사용자 팔레트 검증: 형식이 틀린 항목은 버리고 개수·이름 길이를 제한", () => {
  const raw = [
    { id: "u-ok1", name: " 내 팔레트 ", accent: "#ABC", tone: "warm" },
    { id: "u-ok1", name: "중복", accent: "#123456", tone: "warm" },
    { id: "paper", name: "프리셋 id", accent: "#123456", tone: "warm" },
    { id: "u-bad", name: "색", accent: "red", tone: "warm" },
    { id: "u-bad2", name: "톤", accent: "#123456", tone: "neon" },
    { id: "u-bad3", name: "", accent: "#123456", tone: "cool" },
    ...Array.from({ length: 10 }, (_, i) => ({ id: `u-n${i}`, name: "가".repeat(30), accent: "#123456", tone: "cool" })),
  ];
  const out = sanitizePaletteSpecs(raw);
  assert.equal(out.length, MAX_USER_PALETTES);
  assert.deepEqual(out[0], { id: "u-ok1", name: "내 팔레트", accent: "#aabbcc", tone: "warm" });
  assert.equal(out[1]!.name.length, 20);
  assert.deepEqual(sanitizePaletteSpecs("x"), []);
});

test("팔레트 id: 없는 id 는 기본으로", () => {
  const specs = sanitizePaletteSpecs([{ id: "u-x", name: "x", accent: "#123456", tone: "pure" }]);
  assert.equal(resolvePaletteId("u-x", specs), "u-x");
  assert.equal(resolvePaletteId("sea", specs), "sea");
  assert.equal(resolvePaletteId("u-gone", specs), "default");
  assert.equal(resolvePaletteId(42, specs), "default");
});
