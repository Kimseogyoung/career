import { NextResponse } from "next/server";
import { getStore, isStoreConfigured } from "@/lib/store/instance";

export const runtime = "nodejs";

// 수동 플러시. 저하 상태에서 토큰 교체 후 즉시 재시도시키는 용도.
export async function POST() {
  if (!isStoreConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 409 });
  }
  const store = await getStore();
  if (!store) {
    return NextResponse.json({ error: "not_configured" }, { status: 409 });
  }
  await store.flush();
  return NextResponse.json({ ok: true, ...store.syncStatus() });
}
