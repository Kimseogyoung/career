import { NextResponse } from "next/server";
import { getStore, isStoreConfigured } from "@/lib/store/instance";
import { buildEntry, isValidDate, validateEntryInput } from "@/lib/validation";
import { ulid } from "@/lib/store/ulid";
import { nowKstIso } from "@/lib/time";

export const runtime = "nodejs";

// 엔트리 생성.
export async function POST(req: Request, ctx: { params: Promise<{ date: string }> }) {
  const { date } = await ctx.params;
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

  const entry = buildEntry(parsed.value, ulid(), nowKstIso());
  // 메모리 즉시 반영 + 큐 적재. 원격 반영은 백그라운드 디바운스 플러시가 한다.
  await store.upsertEntry(date, entry);
  return NextResponse.json({ entry }, { status: 201 });
}
