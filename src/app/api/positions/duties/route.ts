import { NextResponse } from "next/server";
import { startCollect } from "@/lib/positions/service";
import { getPositionStore, isStoreConfigured } from "@/lib/store/instance";

export const runtime = "nodejs";

// 고른 직무 저장. 바뀌면 기존 공고를 비우고 바로 새 직무로 수집을 시작한다(기다리지 않음).
export async function PUT(req: Request) {
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const store = await getPositionStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  const before = (await store.get()).duties.join(",");
  try {
    const next = await store.setDuties((body as { duties?: unknown })?.duties);
    const changed = next.duties.join(",") !== before;
    if (changed) void startCollect();
    return NextResponse.json({ duties: next.duties, collecting: changed });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("직무를")) return NextResponse.json({ error: "validation", message: msg }, { status: 400 });
    return NextResponse.json({ error: "upstream", message: msg }, { status: 503 });
  }
}
