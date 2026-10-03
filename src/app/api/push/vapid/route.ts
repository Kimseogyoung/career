import { NextResponse } from "next/server";
import { vapidPublicKey } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 클라이언트가 구독 전에 VAPID 공개키를 받아간다(빌드에 박지 않음 → 이미지 env 무관).
export function GET() {
  const publicKey = vapidPublicKey();
  if (!publicKey) return NextResponse.json({ error: "push_not_configured" }, { status: 409 });
  return NextResponse.json({ publicKey });
}
