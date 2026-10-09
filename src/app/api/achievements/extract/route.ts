import { NextResponse } from "next/server";
import { getSettingsStore, getStore, isStoreConfigured } from "@/lib/store/instance";
import { canGenerate } from "@/lib/summary/summarizer";
import { extractCandidates } from "@/lib/achievements/extract";

export const runtime = "nodejs";
// 추출은 모델 호출이라 길어질 수 있다.
export const maxDuration = 120;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 기간의 기록에서 성과 후보를 추출(저장 안 함).
export async function POST(req: Request) {
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  if (!canGenerate()) return NextResponse.json({ error: "no_api_key" }, { status: 409 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { from, to } = body as { from?: unknown; to?: unknown };
  if (typeof from !== "string" || typeof to !== "string" || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ error: "validation" }, { status: 400 });
  }

  const store = await getStore();
  const settings = await getSettingsStore();
  if (!store || !settings) return NextResponse.json({ error: "not_configured" }, { status: 409 });

  try {
    const candidates = await extractCandidates(store, settings, from, to);
    if (candidates === null) return NextResponse.json({ error: "no_api_key" }, { status: 409 });
    return NextResponse.json({ candidates });
  } catch (e) {
    return NextResponse.json({ error: "extract_failed", message: (e as Error).message }, { status: 503 });
  }
}
