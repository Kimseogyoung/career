import { NextResponse } from "next/server";
import { getStore, isStoreConfigured } from "@/lib/store/instance";

export const runtime = "nodejs";

// 특정 커밋 시점으로 복원(순방향 커밋). 미동기화 기록이 남아 있으면 거부.
export async function POST(req: Request) {
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const sha = (body as { sha?: unknown }).sha;
  if (typeof sha !== "string" || !/^[0-9a-f]{7,40}$/.test(sha)) {
    return NextResponse.json(
      { error: "validation", message: "유효한 sha 가 필요합니다." },
      { status: 400 },
    );
  }

  const store = await getStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  try {
    await store.restoreTo(sha);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: "restore_failed", message: (e as Error).message },
      { status: 409 },
    );
  }
}
