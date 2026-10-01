import { NextResponse } from "next/server";
import { getStore, isStoreConfigured } from "@/lib/store/instance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 동기화 상태. UI 가 저하 배너·미동기화 건수를 보여주는 데 쓴다.
export async function GET() {
  if (!isStoreConfigured()) {
    return NextResponse.json({
      configured: false,
      message: "원격 저장소(STORE_GITHUB_TOKEN/REPO)가 설정되지 않았습니다.",
    });
  }
  const store = await getStore();
  if (!store) {
    return NextResponse.json({ configured: false });
  }
  return NextResponse.json({ configured: true, ...store.syncStatus() });
}
