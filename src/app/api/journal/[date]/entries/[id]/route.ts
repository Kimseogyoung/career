import { NextResponse } from "next/server";
import { getStore, isStoreConfigured } from "@/lib/store/instance";
import { buildEntry, isValidDate, validateEntryInput } from "@/lib/validation";
import { nowKstIso } from "@/lib/time";

export const runtime = "nodejs";

// 엔트리 수정. id 는 유지하고 createdAt 은 기존 것을 보존한다.
export async function PATCH(req: Request, ctx: { params: Promise<{ date: string; id: string }> }) {
  const { date, id } = await ctx.params;
  if (!isValidDate(date)) return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = validateEntryInput(body);
  if (!parsed.ok)
    return NextResponse.json({ error: "validation", message: parsed.error }, { status: 400 });

  const store = await getStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 409 });

  const day = await store.getDay(date);
  const existing = day.entries.find((e) => e.id === id);
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const now = nowKstIso();
  const updated = buildEntry(parsed.value, id, existing.createdAt);
  updated.updatedAt = now;
  await store.upsertEntry(date, updated);
  return NextResponse.json({ entry: updated });
}

// 엔트리 삭제.
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ date: string; id: string }> },
) {
  const { date, id } = await ctx.params;
  if (!isValidDate(date)) return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });

  const store = await getStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 409 });

  await store.deleteEntry(date, id);
  return NextResponse.json({ ok: true });
}
