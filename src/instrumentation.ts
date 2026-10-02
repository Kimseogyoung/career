// Next.js instrumentation — 서버 프로세스 기동 시 1회 실행된다.
// node-cron 스케줄러를 여기서 띄운다. edge 런타임에서는 돌리지 않는다.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  }
}
