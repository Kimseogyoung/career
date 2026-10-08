import { NextResponse } from "next/server";
import { getSettingsStore, isStoreConfigured } from "@/lib/store/instance";
import { isPushConfigured, sendPush } from "@/lib/push";

export const runtime = "nodejs";

// 등록된 기기로 즉시 테스트 알림을 보낸다. 구독이 없으면 동작하지 않는다.
export async function POST() {
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  if (!isPushConfigured())
    return NextResponse.json({ error: "push_not_configured" }, { status: 409 });

  const settings = await getSettingsStore();
  if (!settings) return NextResponse.json({ error: "not_configured" }, { status: 409 });

  const s = await settings.get();
  if (s.pushSubscriptions.length === 0) {
    return NextResponse.json({ error: "no_subscription" }, { status: 409 });
  }

  const { sent, expired } = await sendPush(s.pushSubscriptions, {
    title: "업무 일지 — 테스트",
    body: "테스트 알림입니다. 이게 보이면 알림이 정상 동작합니다.",
    url: "/settings",
  });
  for (const endpoint of expired) await settings.removeSubscription(endpoint);

  return NextResponse.json({ sent, expired: expired.length });
}
