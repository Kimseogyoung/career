import "server-only";
import type { Store } from "@/lib/store/store";
import type { SettingsStore } from "@/lib/store/settings";
import type { Summary } from "@/lib/store/types";
import { isoWeek, isoWeekDates, monthGrid } from "@/lib/calendar";
import { dayBody, rollupBody } from "./context";
import { generateSummary, type SummaryScope } from "./summarizer";

// 요약 조회/저장/생성을 scope(day|week|month)별로 묶는다. API 라우트가 이걸 호출한다.

export function isScope(v: string): v is SummaryScope {
  return v === "day" || v === "week" || v === "month";
}

export async function readSummary(
  store: Store,
  scope: SummaryScope,
  key: string,
): Promise<Summary | null> {
  if (scope === "day") return (await store.getDay(key)).summary ?? null;
  if (scope === "week") return store.getWeekSummary(key);
  return store.getMonthSummary(key);
}

export async function writeSummary(
  store: Store,
  scope: SummaryScope,
  key: string,
  summary: Summary,
): Promise<void> {
  if (scope === "day") await store.putDaySummary(key, summary);
  else if (scope === "week") await store.putWeekSummary(key, summary);
  else await store.putMonthSummary(key, summary);
}

// 그 기간의 하위 데이터를 모아 요약 입력 텍스트로 만든다.
async function buildBody(
  store: Store,
  settings: SettingsStore,
  scope: SummaryScope,
  key: string,
): Promise<{ body: string; label: string }> {
  const s = await settings.get();
  const label = (id: string) => s.categories.find((c) => c.id === id)?.label ?? id;

  if (scope === "day") {
    const day = await store.getDay(key);
    return { body: dayBody(day, label), label: key };
  }

  if (scope === "week") {
    // 그 ISO 주에 속한 7일의 일 요약을 모은다.
    const dates = isoWeekDates(key);
    const items = await Promise.all(
      dates.map(async (d) => ({ label: d, summary: (await store.getDay(d)).summary })),
    );
    return { body: rollupBody(items), label: key };
  }

  // month: 그 달 그리드의 주들에서 주간 요약을 모은다.
  const weeks = [...new Set(monthGrid(key).map((w) => isoWeek(w[0]!)))];
  const items = await Promise.all(
    weeks.map(async (wk) => ({ label: wk, summary: await store.getWeekSummary(wk) })),
  );
  return { body: rollupBody(items), label: key };
}

/** AI 요약 초안을 생성해 저장한다. 키가 없거나 기록이 없으면 null(폴백은 호출 측). */
export async function generateAndSave(
  store: Store,
  settings: SettingsStore,
  scope: SummaryScope,
  key: string,
): Promise<Summary | null> {
  const { body, label } = await buildBody(store, settings, scope, key);
  const s = await settings.get();
  const text = await generateSummary(scope, label, body, s.summaryPrompts);
  if (text === null) return null;

  const now = new Date().toISOString();
  const summary: Summary = {
    text,
    generatedBy: "ai",
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
    generatedAt: now,
    editedAt: null,
    status: "ok",
  };
  await writeSummary(store, scope, key, summary);
  return summary;
}
