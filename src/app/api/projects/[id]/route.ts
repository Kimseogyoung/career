import { NextResponse } from "next/server";
import { getProjectStore, isStoreConfigured } from "@/lib/store/instance";
import type { Project } from "@/lib/store/types";

export const runtime = "nodejs";

// 프로젝트 한 건 수정.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const store = await getProjectStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 409 });

  const p = body as Partial<Project>;
  const patch: Partial<Project> = {};
  for (const k of ["name", "period", "description"] as const) {
    if (typeof p[k] === "string") patch[k] = p[k] as string;
  }
  if (typeof p.order === "number") patch.order = p.order;

  try {
    const updated = await store.update(id, patch);
    if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ project: updated });
  } catch (e) {
    return NextResponse.json({ error: "upstream", message: (e as Error).message }, { status: 503 });
  }
}

// 삭제. (연결된 성과의 projectId 는 그대로 — 프로젝트별 뷰에서 '기타'로 묶임)
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  const store = await getProjectStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  try {
    await store.remove(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "upstream", message: (e as Error).message }, { status: 503 });
  }
}
