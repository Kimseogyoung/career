import { NextResponse } from "next/server";
import { getAchievementStore, isStoreConfigured } from "@/lib/store/instance";
import type { Achievement } from "@/lib/store/types";

export const runtime = "nodejs";

// 성과 한 건 수정(편집 가능 필드만).
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const store = await getAchievementStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 409 });

  const p = body as Partial<Achievement>;
  const patch: Partial<Achievement> = {};
  for (const k of ["title", "problem", "approach", "result", "theme"] as const) {
    if (typeof p[k] === "string") patch[k] = p[k] as string;
  }
  if (Array.isArray(p.tech)) patch.tech = p.tech.filter((t): t is string => typeof t === "string");
  if (typeof p.star === "boolean") patch.star = p.star;

  try {
    const updated = await store.update(id, patch);
    if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ achievement: updated });
  } catch (e) {
    return NextResponse.json({ error: "upstream", message: (e as Error).message }, { status: 503 });
  }
}

// 삭제.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  const store = await getAchievementStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  try {
    await store.remove(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "upstream", message: (e as Error).message }, { status: 503 });
  }
}
