import "server-only";
import cron from "node-cron";
import { getSettingsStore, getStore, isStoreConfigured } from "@/lib/store/instance";
import { generateAndSave } from "@/lib/summary/service";
import { canGenerate } from "@/lib/summary/summarizer";
import { isoWeek } from "@/lib/calendar";
import { todayKst } from "@/lib/time";

// node-cron 스케줄러. Next 서버 프로세스(instrumentation) 안에서 한 번 기동한다.
// 별도 워커 프로세스를 두지 않는다(제약 3). 타임존은 Asia/Seoul 고정.

const TZ = "Asia/Seoul";
let started = false;

async function safe(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error(`[scheduler] ${label} 실패:`, (e as Error).message);
  }
}

// 오늘(KST) 기준 일/주/월 키.
function todayKeys() {
  const date = todayKst();
  return { date, week: isoWeek(date), month: date.slice(0, 7) };
}

async function generate(scope: "day" | "week" | "month", key: string): Promise<void> {
  const store = await getStore();
  const settings = await getSettingsStore();
  if (!store || !settings) return;
  const result = await generateAndSave(store, settings, scope, key);
  console.log(`[scheduler] ${scope} ${key} 요약`, result ? "생성됨" : "건너뜀(키없음/기록없음)");
}

export function startScheduler(): void {
  if (started) return;
  started = true;

  if (!isStoreConfigured()) {
    console.log("[scheduler] 원격 저장소 미설정 — 스케줄러 비활성");
    return;
  }
  if (!canGenerate()) {
    // 요약 자동 생성은 못 하지만, 큐 재시도는 돌려야 한다.
    console.log("[scheduler] ANTHROPIC_API_KEY 없음 — 자동 요약 비활성(큐 재시도만 동작)");
  }

  // 일간 요약: 매일 23:50
  cron.schedule("50 23 * * *", () => void safe("daily", () => generate("day", todayKeys().date)), {
    timezone: TZ,
  });

  // 주간 요약: 일요일 23:55
  cron.schedule(
    "55 23 * * 0",
    () => void safe("weekly", () => generate("week", todayKeys().week)),
    { timezone: TZ },
  );

  // 월간 요약: 매일 23:55 에 '내일이 다음 달 1일'인지(=말일) 확인 후 실행
  cron.schedule(
    "55 23 * * *",
    () =>
      void safe("monthly", async () => {
        const now = new Date();
        const kstNow = new Date(now.getTime() + 9 * 3600_000);
        const tomorrow = new Date(kstNow.getTime() + 24 * 3600_000);
        if (tomorrow.getUTCDate() === 1) await generate("month", todayKeys().month);
      }),
    { timezone: TZ },
  );

  // 쓰기 큐 재시도: 5분마다. 저하 상태에서 미동기화분을 원격에 밀어 넣는다.
  cron.schedule(
    "*/5 * * * *",
    () =>
      void safe("flush", async () => {
        const store = await getStore();
        if (store && store.syncStatus().pendingWrites > 0) await store.flush();
      }),
    { timezone: TZ },
  );

  console.log("[scheduler] 기동 완료 (일 23:50 / 주 일 23:55 / 월 말일 23:55 / 큐 5분)");
}
