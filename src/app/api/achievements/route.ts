import { NextResponse } from "next/server";
import { getAchievementStore, isStoreConfigured } from "@/lib/store/instance";
import type { NewAchievement } from "@/lib/store/achievements";

export const runtime = "nodejs";

// 저장된 성과 목록.
export async function GET() {
  if (!isStoreConfigured()) return NextResponse.json({ achievements: [] });
  const store = await getAchievementStore();
  if (!store) return NextResponse.json({ achievements: [] });
  try {
    return NextResponse.json({ achievements: await store.list() });
  } catch (e) {
    return NextResponse.json(
      { achievements: [], stale: true, message: (e as Error).message },
      { status: 200 },
    );
  }
}

// 후보 여러 건 저장.
export async function POST(req: Request) {
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items)) return NextResponse.json({ error: "validation" }, { status: 400 });

  const store = await getAchievementStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  try {
    const saved = await store.addMany(items as NewAchievement[]);
    return NextResponse.json({ saved }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "upstream", message: (e as Error).message }, { status: 503 });
  }
}
