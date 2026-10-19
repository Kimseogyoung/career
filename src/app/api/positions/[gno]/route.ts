import { NextResponse } from "next/server";
import { getPositionStore, isStoreConfigured } from "@/lib/store/instance";
import type { PositionMark } from "@/lib/store/types";

export const runtime = "nodejs";

// 공고 표시: { mark: "star" | "hidden" | null }
export async function PATCH(req: Request, ctx: { params: Promise<{ gno: string }> }) {
  const gno = Number((await ctx.params).gno);
  if (!Number.isSafeInteger(gno) || gno <= 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const m = (body as { mark?: unknown })?.mark;
  if (m !== null && m !== "star" && m !== "hidden") return NextResponse.json({ error: "validation" }, { status: 400 });
  const store = await getPositionStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  try {
    if (!(await store.setMark(gno, m as PositionMark | null))) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "upstream", message: (e as Error).message }, { status: 503 });
  }
}
