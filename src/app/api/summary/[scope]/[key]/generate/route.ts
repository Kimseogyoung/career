import { NextResponse } from "next/server";
import { getSettingsStore, getStore, isStoreConfigured } from "@/lib/store/instance";
import { generateAndSave, isScope } from "@/lib/summary/service";

export const runtime = "nodejs";
// 요약 생성은 Claude 호출이라 수 초 걸릴 수 있다. 여유 있게.
export const maxDuration = 60;

// AI 요약 초안 생성 + 저장. 키 없으면 204(생성 불가 → UI 는 수동 작성 유지).
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ scope: string; key: string }> },
) {
  const { scope, key } = await ctx.params;
  if (!isScope(scope)) return NextResponse.json({ error: "invalid_scope" }, { status: 400 });
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });

  const store = await getStore();
  const settings = await getSettingsStore();
  if (!store || !settings) return NextResponse.json({ error: "not_configured" }, { status: 409 });

  try {
    const summary = await generateAndSave(store, settings, scope, key);
    if (summary === null) {
      // 키 없음 또는 기록 없음 — 수동 작성 폴백
      return NextResponse.json({ summary: null, reason: "no_key_or_empty" }, { status: 200 });
    }
    return NextResponse.json({ summary });
  } catch (e) {
    return NextResponse.json(
      { error: "generate_failed", message: (e as Error).message },
      { status: 502 },
    );
  }
}
