import { NextResponse } from "next/server";
import { CONTENT_TYPE } from "@/lib/store/media";
import { getThemeAssetStore, isStoreConfigured } from "@/lib/store/instance";
import { isThemeAssetId } from "@/lib/themes";

export const runtime = "nodejs";

/** 앱(로그인)에서 보는 테마 이미지. id 는 내용이 바뀌면 새로 발급되므로 불변 캐시. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isThemeAssetId(id) || !isStoreConfigured())
    return new Response("not found", { status: 404 });
  try {
    const store = await getThemeAssetStore();
    const found = store ? await store.read(id) : null;
    if (!found) return new Response("not found", { status: 404 });
    return new Response(Buffer.from(found.bytes), {
      headers: {
        "Content-Type": CONTENT_TYPE[found.asset.ext],
        "Content-Length": String(found.bytes.length),
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return new Response("unavailable", { status: 503 });
  }
}

/** 삭제. 이 이미지를 쓰던 내 테마 칸은 바탕 테마 그림으로 돌아간다. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isThemeAssetId(id) || !isStoreConfigured())
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const store = await getThemeAssetStore();
    const ok = store ? await store.remove(id) : false;
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: "upstream", message: (e as Error).message }, { status: 503 });
  }
}
