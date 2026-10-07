import { NextResponse } from "next/server";
import { getStore, isStoreConfigured } from "@/lib/store/instance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 데이터 레포 커밋 이력.
export async function GET() {
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  const store = await getStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  try {
    return NextResponse.json({ commits: await store.listCommits(50) });
  } catch (e) {
    return NextResponse.json({ error: "upstream", message: (e as Error).message }, { status: 503 });
  }
}
