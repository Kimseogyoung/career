import "server-only";
import { getSettingsStore, isStoreConfigured } from "./store/instance";
import type { ThemeInputs } from "./themes";

// 레이아웃이 모든 페이지에서 읽는 테마 설정(내 팔레트·내 테마·올린 이미지·공개 Showcase 테마).
// 설정은 메모리 캐시라 보통 즉시 끝나지만, 기동 직후 원격이 느리거나 죽어 있으면 기다리지 않고
// 기본 테마만으로 그린다(제약 6).
const TIMEOUT_MS = 1500;

const FALLBACK: ThemeInputs = { paletteSpecs: [], themeSpecs: [], assets: [] };

export async function loadThemeInputs(): Promise<ThemeInputs> {
  if (!isStoreConfigured()) return FALLBACK;
  const load = (async (): Promise<ThemeInputs> => {
    const store = await getSettingsStore();
    if (!store) return FALLBACK;
    const s = await store.get();
    return {
      paletteSpecs: s.palettes ?? [],
      themeSpecs: s.themes ?? [],
      assets: s.themeAssets ?? [],
      showcaseTheme: s.showcaseTheme,
    };
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ThemeInputs>((resolve) => {
    timer = setTimeout(() => resolve(FALLBACK), TIMEOUT_MS);
  });
  try {
    return await Promise.race([load.catch(() => FALLBACK), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
