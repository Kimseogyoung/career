import { NextResponse } from "next/server";
import { getResumeStore, isStoreConfigured } from "@/lib/store/instance";

export const runtime = "nodejs";

// 저장본 한 건(본문 포함).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  const store = await getResumeStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  try {
    const resume = await store.get(id);
    if (!resume) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ resume });
  } catch (e) {
    return NextResponse.json({ error: "upstream", message: (e as Error).message }, { status: 503 });
  }
}

// 삭제. 원본 성과·프로젝트에는 영향 없음.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  const store = await getResumeStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  try {
    if (!(await store.remove(id))) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "upstream", message: (e as Error).message }, { status: 503 });
  }
}
