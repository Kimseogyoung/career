import { NextResponse } from "next/server";
import { getStore, isStoreConfigured } from "@/lib/store/instance";
import { isScope, readSummary, writeSummary } from "@/lib/summary/service";
import { canGenerate } from "@/lib/summary/summarizer";
import type { Summary } from "@/lib/store/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 요약 조회. canGenerate 로 UI 가 '자동 생성' 버튼 노출 여부를 판단한다.
export async function GET(_req: Request, ctx: { params: Promise<{ scope: string; key: string }> }) {
  const { scope, key } = await ctx.params;
  if (!isScope(scope)) return NextResponse.json({ error: "invalid_scope" }, { status: 400 });
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  const store = await getStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  try {
    const summary = await readSummary(store, scope, key);
    return NextResponse.json({ summary, canGenerate: canGenerate() });
  } catch (e) {
    return NextResponse.json({ error: "upstream", message: (e as Error).message }, { status: 503 });
  }
}

// 요약 수동 저장/수정. 사람이 고친 것은 editedAt 을 찍어 AI 초안과 구분한다.
export async function PUT(req: Request, ctx: { params: Promise<{ scope: string; key: string }> }) {
  const { scope, key } = await ctx.params;
  if (!isScope(scope)) return NextResponse.json({ error: "invalid_scope" }, { status: 400 });
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const text = (body as { text?: unknown }).text;
  if (typeof text !== "string") {
    return NextResponse.json(
      { error: "validation", message: "text 가 필요합니다." },
      { status: 400 },
    );
  }

  const store = await getStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 409 });

  const existing = await readSummary(store, scope, key);
  const now = new Date().toISOString();
  const summary: Summary = {
    text,
    generatedBy: existing?.generatedBy ?? "manual",
    model: existing?.model ?? null,
    generatedAt: existing?.generatedAt ?? null,
    editedAt: now,
    status: "ok",
  };
  try {
    await writeSummary(store, scope, key, summary);
    return NextResponse.json({ summary });
  } catch (e) {
    return NextResponse.json({ error: "upstream", message: (e as Error).message }, { status: 503 });
  }
}
