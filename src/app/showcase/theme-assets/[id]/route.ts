import { CONTENT_TYPE } from "@/lib/store/media";
import { getSettingsStore, getThemeAssetStore, isStoreConfigured } from "@/lib/store/instance";
import { isThemeAssetId, publicAssetIds } from "@/lib/themes";

export const runtime = "nodejs";

/**
 * 공개 Showcase 테마 이미지. /showcase 하위라 로그인 없이 열린다(ADR-013·019).
 * 공개 테마가 실제로 쓰는 이미지만 내보낸다 — 앱에만 쓰는 이미지는 이 경로로 읽을 수 없다.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isThemeAssetId(id) || !isStoreConfigured())
    return new Response("not found", { status: 404 });
  try {
    const settings = await getSettingsStore();
    const s = settings ? await settings.get() : null;
    const allowed = s
      ? publicAssetIds({
          paletteSpecs: [],
          themeSpecs: s.themes ?? [],
          assets: s.themeAssets ?? [],
          showcaseTheme: s.showcaseTheme,
        })
      : new Set<string>();
    if (!allowed.has(id)) return new Response("not found", { status: 404 });
    const store = await getThemeAssetStore();
    const found = store ? await store.read(id) : null;
    if (!found) return new Response("not found", { status: 404 });
    return new Response(Buffer.from(found.bytes), {
      headers: {
        "Content-Type": CONTENT_TYPE[found.asset.ext],
        "Content-Length": String(found.bytes.length),
        // 공개 테마에서 빠지면 더는 보이면 안 되므로 짧게만 캐시한다(서버는 메모리 캐시라 다시 받아도 싸다).
        "Cache-Control": "public, max-age=300",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return new Response("unavailable", { status: 503 });
  }
}
