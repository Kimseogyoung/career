import "server-only";
import { DEFAULT_PALETTE, resolvePaletteId, type PaletteSpec } from "./palette";
import { getSettingsStore, isStoreConfigured } from "./store/instance";

// 레이아웃이 모든 페이지에서 읽는 팔레트 설정. 설정은 메모리 캐시라 보통 즉시 끝나지만,
// 기동 직후 원격이 느리거나 죽어 있으면 기다리지 않고 기본 팔레트로 그린다(제약 6).
const TIMEOUT_MS = 1500;

export interface PaletteSettings {
  specs: PaletteSpec[];
  showcase: string;
}

const FALLBACK: PaletteSettings = { specs: [], showcase: DEFAULT_PALETTE.id };

export async function loadPaletteSettings(): Promise<PaletteSettings> {
  if (!isStoreConfigured()) return FALLBACK;
  const load = (async () => {
    const store = await getSettingsStore();
    if (!store) return FALLBACK;
    const s = await store.get();
    const specs = s.palettes ?? [];
    return { specs, showcase: resolvePaletteId(s.showcasePalette, specs) };
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<PaletteSettings>((resolve) => {
    timer = setTimeout(() => resolve(FALLBACK), TIMEOUT_MS);
  });
  try {
    return await Promise.race([load.catch(() => FALLBACK), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
