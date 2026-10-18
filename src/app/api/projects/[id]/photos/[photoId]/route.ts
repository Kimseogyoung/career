import { NextResponse } from "next/server";
import { getProjectStore, isStoreConfigured } from "@/lib/store/instance";

export const runtime = "nodejs";

// 사진 한 장 삭제(목록에서 빼고 파일도 지움).
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; photoId: string }> },
) {
  const { id, photoId } = await ctx.params;
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  const store = await getProjectStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  try {
    const ok = await store.removePhoto(id, photoId);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "upstream", message: (e as Error).message }, { status: 503 });
  }
}
