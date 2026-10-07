import { NextResponse } from "next/server";
import { getStore, isStoreConfigured } from "@/lib/store/instance";
import { buildEntry, isValidDate, validateEntryInput } from "@/lib/validation";
import { ulid } from "@/lib/store/ulid";
import { nowKstIso } from "@/lib/time";
import { mergeEntries } from "@/lib/merge";
import type { Store } from "@/lib/store/store";
import type { Entry } from "@/lib/store/types";

/** 저장 직후, 같은 내용의 연속 기록을 하나로 합친다. 합쳐졌으면 합쳐진 기록을 돌려준다. */
async function mergeAfterUpsert(store: Store, date: string, id: string): Promise<Entry | null> {
  const day = await store.getDay(date);
  const plan = mergeEntries(day.entries, id, nowKstIso());
  if (!plan) return null;
  await store.upsertEntry(date, plan.merged);
  for (const rid of plan.removeIds) await store.deleteEntry(date, rid);
  return plan.merged;
}

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
  try {
    await store.upsertEntry(date, entry);
    const merged = await mergeAfterUpsert(store, date, entry.id);
    return NextResponse.json({ entry: merged ?? entry }, { status: 201 });
  } catch (e) {
    console.error("[journal] 엔트리 저장 실패:", e);
    return NextResponse.json(
      { error: "save_failed", message: (e as Error).message },
      { status: 503 },
    );
  }
}
