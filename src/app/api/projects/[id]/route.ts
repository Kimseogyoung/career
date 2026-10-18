import { NextResponse } from "next/server";
import { getProjectStore, isStoreConfigured } from "@/lib/store/instance";
import type { ProjectPatch } from "@/lib/store/projects";

export const runtime = "nodejs";

// 프로젝트 한 건 수정. 사진은 순서·설명만(추가·삭제는 /photos).
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

  const b = body as Record<string, unknown>;
  const patch: ProjectPatch = {};
  if (typeof b.name === "string") patch.name = b.name;
  if (typeof b.description === "string") patch.description = b.description;
  if ("start" in b) patch.start = (b.start ?? null) as ProjectPatch["start"];
  if ("end" in b) patch.end = (b.end ?? null) as ProjectPatch["end"];
  if ("careerId" in b) patch.careerId = typeof b.careerId === "string" ? b.careerId : null;
  if (Array.isArray(b.photos)) {
    patch.photos = b.photos
      .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
      .filter((p) => typeof p.id === "string")
      .map((p) => ({
        id: p.id as string,
        caption: typeof p.caption === "string" ? p.caption : undefined,
      }));
  }

  try {
    const updated = await store.update(id, patch);
    if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ project: updated });
  } catch (e) {
    return NextResponse.json({ error: "upstream", message: (e as Error).message }, { status: 503 });
  }
}

// 삭제. 사진 파일도 함께 지운다. 연결된 성과의 projectId 는 그대로('기타'로 묶임).
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
