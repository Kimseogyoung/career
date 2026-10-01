import { NextResponse } from "next/server";
import { getSettingsStore, isStoreConfigured } from "@/lib/store/instance";
import { DEFAULT_SETTINGS } from "@/lib/store/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 설정 조회. 미설정(원격 없음)이면 기본값을 돌려준다 — UI 는 어쨌든 동작해야 한다.
export async function GET() {
  if (!isStoreConfigured()) {
    return NextResponse.json({ settings: DEFAULT_SETTINGS, configured: false });
  }
  const settings = await getSettingsStore();
  if (!settings) return NextResponse.json({ settings: DEFAULT_SETTINGS, configured: false });
  try {
    return NextResponse.json({ settings: await settings.get(), configured: true });
  } catch (e) {
    return NextResponse.json(
      { settings: DEFAULT_SETTINGS, configured: true, stale: true, message: (e as Error).message },
      { status: 200 },
    );
  }
}

// 설정 부분 갱신(기록 시간대 등).
export async function PUT(req: Request) {
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const settings = await getSettingsStore();
  if (!settings) return NextResponse.json({ error: "not_configured" }, { status: 409 });

  const patch = body as Record<string, unknown>;
  const allowed: Record<string, unknown> = {};
  if (patch.recordingHours) allowed.recordingHours = patch.recordingHours;
  if (patch.categories) allowed.categories = patch.categories;
  if (patch.timezone) allowed.timezone = patch.timezone;

  try {
    const next = await settings.update(allowed);
    return NextResponse.json({ settings: next });
  } catch (e) {
    return NextResponse.json({ error: "upstream", message: (e as Error).message }, { status: 503 });
  }
}
