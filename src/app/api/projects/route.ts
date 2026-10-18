import { NextResponse } from "next/server";
import { getProjectStore, isStoreConfigured } from "@/lib/store/instance";
import type { NewProject } from "@/lib/store/projects";

export const runtime = "nodejs";

// 프로젝트 목록(최신순).
export async function GET() {
  if (!isStoreConfigured()) return NextResponse.json({ projects: [] });
  const store = await getProjectStore();
  if (!store) return NextResponse.json({ projects: [] });
  try {
    return NextResponse.json({ projects: await store.list() });
  } catch (e) {
    return NextResponse.json(
      { projects: [], stale: true, message: (e as Error).message },
      { status: 200 },
    );
  }
}

// 새 프로젝트 추가. 기간(start/end)은 저장소에서 검증·정리한다.
export async function POST(req: Request) {
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || !b.name.trim())
    return NextResponse.json({ error: "validation" }, { status: 400 });

  const store = await getProjectStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  try {
    const input: NewProject = {
      name: b.name,
      description: typeof b.description === "string" ? b.description : undefined,
      start: b.start as NewProject["start"],
      end: b.end as NewProject["end"],
    };
    const project = await store.add(input);
    return NextResponse.json({ project }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "upstream", message: (e as Error).message }, { status: 503 });
  }
}
