import { NextResponse } from "next/server";
import { getSettingsStore, isStoreConfigured } from "@/lib/store/instance";
import { isPushConfigured } from "@/lib/push";
import { ulid } from "@/lib/store/ulid";
import type { PushSubscriptionRecord } from "@/lib/store/types";

export const runtime = "nodejs";

// 브라우저가 만든 PushSubscription 을 등록한다.
export async function POST(req: Request) {
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  if (!isPushConfigured())
    return NextResponse.json({ error: "push_not_configured" }, { status: 409 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const b = body as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
    label?: unknown;
  };
  if (
    typeof b.endpoint !== "string" ||
    typeof b.keys?.p256dh !== "string" ||
    typeof b.keys?.auth !== "string"
  ) {
    return NextResponse.json({ error: "validation" }, { status: 400 });
  }

  const settings = await getSettingsStore();
  if (!settings) return NextResponse.json({ error: "not_configured" }, { status: 409 });

  const record: PushSubscriptionRecord = {
    id: ulid(),
    label: typeof b.label === "string" ? b.label : "기기",
    endpoint: b.endpoint,
    keys: { p256dh: b.keys.p256dh, auth: b.keys.auth },
    createdAt: new Date().toISOString(),
  };
  try {
    await settings.addSubscription(record);
    return NextResponse.json({ ok: true, id: record.id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "upstream", message: (e as Error).message }, { status: 503 });
  }
}

// 구독 해제(endpoint 로).
export async function DELETE(req: Request) {
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const endpoint = (body as { endpoint?: unknown }).endpoint;
  if (typeof endpoint !== "string")
    return NextResponse.json({ error: "validation" }, { status: 400 });

  const settings = await getSettingsStore();
  if (!settings) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  try {
    await settings.removeSubscription(endpoint);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "upstream", message: (e as Error).message }, { status: 503 });
  }
}
