import { NextResponse } from "next/server";
import { loadPortfolio } from "@/lib/export/load";
import { getResumeStore, isStoreConfigured } from "@/lib/store/instance";
import { ResumeError } from "@/lib/store/resumes";

export const runtime = "nodejs";

// 내보내기 저장본 목록(최신순).
export async function GET() {
  if (!isStoreConfigured()) return NextResponse.json({ resumes: [] });
  const store = await getResumeStore();
  if (!store) return NextResponse.json({ resumes: [] });
  try {
    return NextResponse.json({ resumes: await store.list() });
  } catch (e) {
    return NextResponse.json({ resumes: [], stale: true, message: (e as Error).message });
  }
}

// 지금 조립 결과를 저장본으로 얼린다. 본문은 서버가 다시 조립한다(클라이언트 문서를 받지 않음).
export async function POST(req: Request) {
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.kind !== undefined && b.kind !== "portfolio")
    return NextResponse.json({ error: "validation" }, { status: 400 });
  const options = { starOnly: b.starOnly === true, photos: b.photos !== false };

  const store = await getResumeStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  try {
    const doc = await loadPortfolio(options);
    const meta = await store.save({
      name: typeof b.name === "string" ? b.name : "",
      kind: "portfolio",
      options,
      doc,
    });
    return NextResponse.json({ resume: meta }, { status: 201 });
  } catch (e) {
    if (e instanceof ResumeError) return NextResponse.json({ error: e.code }, { status: 413 });
    return NextResponse.json({ error: "upstream", message: (e as Error).message }, { status: 503 });
  }
}
