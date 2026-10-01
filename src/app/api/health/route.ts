import { NextResponse } from "next/server";

/**
 * 인증 없이 접근 가능하다. nginx와 docker compose 헬스체크가 쓴다.
 * 원격 저장소나 외부 API 상태는 보지 않는다 — 그쪽이 죽어도 앱 자체는 정상이기 때문이다(ADR 제약 6).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}
