import { NextResponse } from "next/server";
import { isCollecting } from "@/lib/positions/service";
import { getPositionStore, isStoreConfigured } from "@/lib/store/instance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 수집 진행 여부 + 마지막 실행(화면이 수집 끝을 기다릴 때 쓴다).
export async function GET() {
  if (!isStoreConfigured()) return NextResponse.json({ running: false });
  const store = await getPositionStore();
  try {
    const f = await store?.get();
    return NextResponse.json({ running: isCollecting(), lastRun: f?.lastRun ?? null, count: f?.postings.length ?? 0 });
  } catch (e) {
    return NextResponse.json({ running: isCollecting(), stale: true, message: (e as Error).message });
  }
}
