import { NextResponse } from "next/server";
import { getProfileStore, isStoreConfigured } from "@/lib/store/instance";
import { DEFAULT_PROFILE } from "@/lib/store/profile";
import type { Profile } from "@/lib/store/types";

export const runtime = "nodejs";

// 내 정보 조회.
export async function GET() {
  if (!isStoreConfigured()) return NextResponse.json({ profile: DEFAULT_PROFILE });
  const store = await getProfileStore();
  if (!store) return NextResponse.json({ profile: DEFAULT_PROFILE });
  try {
    return NextResponse.json({ profile: await store.get() });
  } catch (e) {
    return NextResponse.json(
      { profile: DEFAULT_PROFILE, stale: true, message: (e as Error).message },
      { status: 200 },
    );
  }
}

// 내 정보 전체 교체.
export async function PUT(req: Request) {
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const store = await getProfileStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 409 });

  const b = body as Partial<Profile>;
  try {
    const saved = await store.put({
      name: typeof b.name === "string" ? b.name : undefined,
      headline: typeof b.headline === "string" ? b.headline : undefined,
      intro: typeof b.intro === "string" ? b.intro : undefined,
      techStack: Array.isArray(b.techStack) ? b.techStack : [],
      career: Array.isArray(b.career) ? b.career : [],
    });
    return NextResponse.json({ profile: saved });
  } catch (e) {
    return NextResponse.json({ error: "upstream", message: (e as Error).message }, { status: 503 });
  }
}
