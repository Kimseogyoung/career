import { NextResponse } from "next/server";
import { PHOTO_BYTES_MAX } from "@/lib/career-limits";
import { getProjectStore, isStoreConfigured } from "@/lib/store/instance";
import { PhotoError } from "@/lib/store/projects";

export const runtime = "nodejs";

const STATUS: Record<PhotoError["code"], number> = {
  not_found: 404,
  too_many: 409,
  too_large: 413,
  unsupported: 415,
};

/**
 * 사진 업로드. 본문은 이미지 바이트 그대로(브라우저에서 이미 줄여 보낸 webp/jpg/png).
 * 폭·높이·설명은 쿼리로 받는다. 형식은 서버가 바이트 시그니처로 다시 판별한다.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > PHOTO_BYTES_MAX) return NextResponse.json({ error: "too_large" }, { status: 413 });

  const bytes = new Uint8Array(await req.arrayBuffer());
  const url = new URL(req.url);
  const store = await getProjectStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 409 });

  try {
    const photo = await store.addPhoto(id, bytes, {
      width: Number(url.searchParams.get("w")),
      height: Number(url.searchParams.get("h")),
      caption: url.searchParams.get("caption") ?? undefined,
    });
    return NextResponse.json({ photo }, { status: 201 });
  } catch (e) {
    if (e instanceof PhotoError) return NextResponse.json({ error: e.code }, { status: STATUS[e.code] });
    return NextResponse.json({ error: "upstream", message: (e as Error).message }, { status: 503 });
  }
}
