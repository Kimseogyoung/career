import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PRESET_PALETTES } from "./palette";
import {
  PRESET_THEMES,
  dropUnknownAssets,
  minDimFor,
  presetImageUrl,
  publicAssetIds,
  resolveTheme,
  sanitizeThemeAssets,
  sanitizeThemeSpecs,
  themeBundle,
  themeCss,
  type ResolveContext,
  type ThemeAsset,
  type ThemeSpec,
} from "./themes";

const ASSET: ThemeAsset = {
  id: "01AAAAAAAAAAAAAAAAAAAAAAAA",
  ext: "webp",
  width: 1920,
  height: 1080,
  bytes: 1000,
  lum: 0.1,
};
const ctx = (specs: ThemeSpec[], assets: ThemeAsset[] = []): ResolveContext => ({
  specs,
  assets,
  paletteExists: (id) => PRESET_PALETTES.some((p) => p.id === id),
  assetUrl: (a) => `/api/theme-assets/${a.id}`,
});

test("기본 테마: 팔레트가 모두 있고, 그림 파일이 public/themes 에 있다", () => {
  for (const t of PRESET_THEMES) {
    assert.ok(
      PRESET_PALETTES.some((p) => p.id === t.palette),
      `${t.id} 팔레트`,
    );
    for (const slot of ["app", "band", "show"] as const) {
      if (!t.images[slot]) continue;
      const file = path.join(process.cwd(), "public", presetImageUrl(t.id, slot));
      assert.ok(fs.existsSync(file), file);
    }
  }
});

test("테마 CSS: 기본은 :root, 그 밖은 data-tid, 다크는 OS 다크·수동 다크 두 곳", () => {
  const def = themeCss(resolveTheme("default", ctx([])));
  assert.match(def, /^:root\{/);
  assert.match(def, /--app-img:none/);
  assert.match(def, /--rk-ctl:1;/);
  const forest = themeCss(resolveTheme("forest", ctx([])));
  assert.match(forest, /^:root\[data-tid="forest"\]\{/);
  assert.match(forest, /--app-img:url\("\/themes\/forest-app\.webp"\)/);
  assert.match(forest, /--app-blur:8px/);
  assert.match(forest, /:root\[data-tid="forest"\]:not\(\[data-theme="light"\]\)/);
  assert.match(forest, /:root\[data-tid="forest"\]\[data-theme="dark"\]/);
  assert.equal(
    themeCss(resolveTheme("forest", ctx([])), 'x"]{}*{'),
    "",
    "이상한 선택자는 내보내지 않는다",
  );
});

test("내 테마 검증: 열거값·id 형식이 아니면 버린다(CSS 주입 방지)", () => {
  const specs = sanitizeThemeSpecs([
    {
      id: "t-ok1",
      name: "숲 변형",
      base: "forest",
      palette: "sea",
      shape: { radius: "none", button: "bogus" },
      images: { app: { kind: "none", blur: 99, dim: 2 } },
    },
    { id: "t-bad", name: "x", base: "nope" }, // 없는 바탕
    { id: 'x"]{}', name: "x", base: "forest" }, // id 형식
    {
      id: "t-ok2",
      name: "a",
      base: "sky",
      palette: "red;}*{color:red",
      images: { band: { kind: "upload", asset: "../../etc" } },
    },
    { id: "t-ok1", name: "중복", base: "sky" },
  ]);
  assert.deepEqual(
    specs.map((s) => s.id),
    ["t-ok1", "t-ok2"],
  );
  assert.deepEqual(specs[0]!.shape, { radius: "none" });
  assert.deepEqual(specs[0]!.images?.app, { kind: "none", blur: 16, dim: 0.95 });
  assert.equal(specs[1]!.palette, undefined);
  assert.equal(specs[1]!.images, undefined);
});

test("해석: 없는 팔레트·지워진 이미지는 바탕 테마 값으로, 바꾼 모양만 덮어쓴다", () => {
  const spec: ThemeSpec = {
    id: "t-a",
    name: "a",
    base: "sky",
    palette: "u-gone",
    shape: { radius: "none" },
    images: { band: { kind: "upload", asset: ASSET.id }, show: { kind: "none" } },
  };
  const t = resolveTheme("t-a", ctx([spec]));
  assert.equal(t.palette, "sky");
  assert.equal(t.shape.radius, "none");
  assert.equal(t.shape.button, "soft"); // 바탕 테마 값
  assert.equal(t.band, null, "등록되지 않은 이미지는 그리지 않는다");
  assert.equal(t.show, null);
  assert.equal(t.app?.url, "/themes/sky-app.webp");
});

test("해석: 어두운 올린 이미지는 라이트 덮기 최소값을 지킨다", () => {
  const spec: ThemeSpec = {
    id: "t-b",
    name: "b",
    base: "default",
    images: { app: { kind: "upload", asset: ASSET.id, dim: 0 } },
  };
  const t = resolveTheme("t-b", ctx([spec], [ASSET]));
  assert.equal(t.app?.url, `/api/theme-assets/${ASSET.id}`);
  assert.equal(t.app?.dim, minDimFor(0.1));
  assert.ok(minDimFor(0.1) >= 0.7 && minDimFor(0.95) === 0);
});

test("해석: 팔레트를 바꾸면 바탕 테마의 장식 색 대신 팔레트에서 파생", () => {
  const keep = resolveTheme("sky", ctx([]));
  assert.ok(keep.extras.light.tape);
  const changed = resolveTheme("t-c", ctx([{ id: "t-c", name: "c", base: "sky", palette: "sea" }]));
  assert.equal(changed.extras.light.tape, undefined);
  assert.match(themeCss(changed), /--tape:color-mix/);
});

test("묶음: 팔레트 CSS + 모든 테마 + 공개 Showcase 선택자, 테마→팔레트 표", () => {
  const b = themeBundle({
    paletteSpecs: [],
    themeSpecs: [{ id: "t-d", name: "d", base: "night", palette: "paper" }],
    assets: [],
    showcaseTheme: "t-d",
  });
  assert.equal(b.paletteOf["night"], "night");
  assert.equal(b.paletteOf["t-d"], "paper");
  assert.equal(b.paletteOf["showcase"], "paper");
  assert.equal(b.showcasePalette, "paper");
  assert.match(b.css, /:root\[data-tid="showcase"\]\{/);
  assert.match(b.css, /:root\[data-palette="paper"\]/);
});

test("공개 이미지: 공개 테마의 첫 화면에 쓴 이미지만", () => {
  const specs: ThemeSpec[] = [
    {
      id: "t-e",
      name: "e",
      base: "default",
      images: {
        app: { kind: "upload", asset: "01BBBBBBBBBBBBBBBBBBBBBBBB" },
        show: { kind: "upload", asset: ASSET.id },
      },
    },
  ];
  assert.deepEqual(
    [...publicAssetIds({ paletteSpecs: [], themeSpecs: specs, assets: [], showcaseTheme: "t-e" })],
    [ASSET.id],
  );
  assert.equal(
    publicAssetIds({ paletteSpecs: [], themeSpecs: specs, assets: [], showcaseTheme: "default" })
      .size,
    0,
  );
  // 공개 Showcase 이미지는 공개 경로로
  const b = themeBundle({
    paletteSpecs: [],
    themeSpecs: specs,
    assets: [ASSET],
    showcaseTheme: "t-e",
  });
  assert.match(
    b.css,
    new RegExp(
      `:root\\[data-tid="showcase"\\]\\{[^}]*--show-img:url\\("/showcase/theme-assets/${ASSET.id}"\\)`,
    ),
  );
});

test("이미지 삭제: 그 이미지를 쓰던 칸은 바탕 그림으로(나머지 설정은 유지)", () => {
  const [s] = dropUnknownAssets(
    [
      {
        id: "t-f",
        name: "f",
        base: "forest",
        images: {
          app: { kind: "upload", asset: ASSET.id, blur: 4 },
          band: { kind: "upload", asset: ASSET.id },
        },
      },
    ],
    new Set(),
  );
  assert.deepEqual(s!.images?.app, { blur: 4 });
  assert.equal(s!.images?.band, undefined);
});

test("이미지 목록 검증: 형식·개수", () => {
  const list = sanitizeThemeAssets([
    ASSET,
    { ...ASSET },
    { id: "bad", ext: "webp" },
    { ...ASSET, id: "01CCCCCCCCCCCCCCCCCCCCCCCC", ext: "svg" },
  ]);
  assert.deepEqual(
    list.map((a) => a.id),
    [ASSET.id],
  );
});
