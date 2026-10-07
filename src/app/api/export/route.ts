import { NextResponse } from "next/server";
import { getSettingsStore, getStore, isStoreConfigured } from "@/lib/store/instance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 전체 데이터를 JSON 파일 하나로 내려받는다(로컬 2차 사본·탈출구).
export async function GET() {
  if (!isStoreConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 409 });
  const store = await getStore();
  const settingsStore = await getSettingsStore();
  if (!store) return NextResponse.json({ error: "not_configured" }, { status: 409 });

  try {
    const data = await store.exportAll();
    const settings = settingsStore ? await settingsStore.get() : null;
    const payload = JSON.stringify({ ...data, settings }, null, 2);
    const stamp = data.exportedAt.slice(0, 10);
    return new NextResponse(payload, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="career-log-${stamp}.json"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "export_failed", message: (e as Error).message },
      { status: 503 },
    );
  }
}
