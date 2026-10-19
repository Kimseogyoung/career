import { NextResponse } from "next/server";
import { getThemeAssetStore, isStoreConfigured } from "@/lib/store/instance";
import { ThemeAssetError } from "@/lib/store/theme-assets";
import { THEME_BYTES_MAX } from "@/lib/themes";

export const runtime = "nodejs";

const STATUS: Record<ThemeAssetError["code"], number> = {
  not_found: 404,
  too_many: 409,
  too_large: 413,
  unsupported: 415,
};

/**
 * 테마 이미지 업로드(ADR-019). 본문은 브라우저에서 이미 줄인 이미지 바이트 그대로.
 * 폭·높이·평균 밝기는 쿼리로 받는다. 형식은 서버가 바이트 시그니처로 다시 판별한다.
 */
export async function POST(req: Request) {
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > THEME_BYTES_MAX) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const bytes = new Uint8Array(await req.arrayBuffer());
  const url = new URL(req.url);
  const store = await getThemeAssetStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  try {
    const asset = await store.add(bytes, {
      width: Number(url.searchParams.get("w")),
      height: Number(url.searchParams.get("h")),
      lum: Number(url.searchParams.get("lum")),
    });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (e) {
    if (e instanceof ThemeAssetError)
      return NextResponse.json({ error: e.code }, { status: STATUS[e.code] });
    return NextResponse.json({ error: "upstream", message: (e as Error).message }, { status: 503 });
  }
}
