import { NextResponse } from "next/server";
import { getStore, isStoreConfigured } from "@/lib/store/instance";
import { isValidDate } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 하루치 기록 조회. 응답에 동기화 상태(meta)를 함께 실어 UI 가 저하 상태를 표시한다.
export async function GET(_req: Request, ctx: { params: Promise<{ date: string }> }) {
  const { date } = await ctx.params;
  if (!isValidDate(date)) {
    return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  }
  if (!isStoreConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 409 });
  }
  const store = await getStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 409 });

  try {
    const day = await store.getDay(date);
    const { pendingWrites, degraded } = store.syncStatus();
    return NextResponse.json({ date, day, meta: { stale: degraded, pendingWrites } });
  } catch (e) {
    // 원격 장애 + 캐시에도 없음. 데이터를 숨기지 말고 저하를 알린다.
    return NextResponse.json(
      { error: "upstream_unavailable", message: (e as Error).message },
      { status: 503 },
    );
  }
}
