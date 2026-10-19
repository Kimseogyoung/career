import { NextResponse } from "next/server";
import { collectIfStale, manualWaitMs, startCollect } from "@/lib/positions/service";
import { isStoreConfigured } from "@/lib/store/instance";

export const runtime = "nodejs";

// 수집 시작. 끝날 때까지 기다리지 않는다(202).
// - { auto: true }: 탭을 열 때 — 마지막 수집이 12시간 넘었을 때만(아니면 200 collecting:false)
// - 그 외("지금 수집"): 돌고 있거나 10분 안에 돌았으면 거절(게임잡을 두드리지 않게)
export async function POST(req: Request) {
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  const body = (await req.json().catch(() => ({}))) as { auto?: unknown };
  if (body.auto === true) {
    const started = await collectIfStale();
    return NextResponse.json({ collecting: started }, { status: started ? 202 : 200 });
  }
  const wait = await manualWaitMs();
  if (wait > 0) return NextResponse.json({ error: "too_soon", waitMs: wait }, { status: 429 });
  void startCollect();
  return NextResponse.json({ collecting: true }, { status: 202 });
}
