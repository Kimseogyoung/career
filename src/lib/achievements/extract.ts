import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Store } from "@/lib/store/store";
import type { SettingsStore } from "@/lib/store/settings";
import type { NewAchievement } from "@/lib/store/achievements";
import { canGenerate } from "@/lib/summary/summarizer";
import {
  ACHIEVEMENT_FORMAT,
  resolveAchievementSystem,
} from "@/lib/summary/prompts";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

/** 기간 [from, to] 의 엔트리를 날짜별로 묶어 추출 입력 텍스트로. */
async function buildRangeBody(store: Store, settings: SettingsStore, from: string, to: string) {
  const s = await settings.get();
  const label = (id: string) => s.categories.find((c) => c.id === id)?.label ?? id;

  const all = await store.getAllEntries();
  const inRange = all
    .filter((e) => e.date >= from && e.date <= to)
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.start < b.start ? -1 : 1));

  const byDate = new Map<string, string[]>();
  for (const e of inRange) {
    const tags = e.tags.length ? ` [${e.tags.join(", ")}]` : "";
    const line = `${e.start}-${e.end} (${label(e.category)})${tags}: ${e.content}`;
    const arr = byDate.get(e.date) ?? [];
    arr.push(line);
    byDate.set(e.date, arr);
  }

  return [...byDate.entries()].map(([d, lines]) => `## ${d}\n${lines.join("\n")}`).join("\n\n");
}

/** 모델 출력에서 JSON 배열만 뽑아 파싱. 코드펜스·잡텍스트에 견딘다. */
function parseCandidates(text: string): NewAchievement[] {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1]!.trim();
  const start = t.indexOf("[");
  const end = t.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(t.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];

  const out: NewAchievement[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (!title) continue;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
    const tech = Array.isArray(o.tech)
      ? o.tech.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean)
      : [];
    const sourceDates = Array.isArray(o.sourceDates)
      ? o.sourceDates.filter((x): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x))
      : [];
    out.push({
      title,
      problem: str(o.problem),
      approach: str(o.approach),
      result: str(o.result),
      theme: str(o.theme),
      tech,
      sourceDates,
      createdBy: "ai",
    });
  }
  return out;
}

/**
 * 기간의 기록에서 성과 후보를 추출한다(저장은 하지 않음). 키가 없거나 기록이 없으면 null.
 */
export async function extractCandidates(
  store: Store,
  settings: SettingsStore,
  from: string,
  to: string,
): Promise<NewAchievement[] | null> {
  if (!canGenerate()) return null;
  const body = await buildRangeBody(store, settings, from, to);
  if (!body.trim()) return [];

  const s = await settings.get();
  const guide = s.achievementPrompts?.guide?.trim();
  const userContent = [
    `기간: ${from} ~ ${to}`,
    ACHIEVEMENT_FORMAT,
    guide ? `추가 지침: ${guide}` : "",
    "",
    "--- 기록 ---",
    body,
  ]
    .filter(Boolean)
    .join("\n");

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: resolveAchievementSystem(s.achievementPrompts),
    messages: [{ role: "user", content: userContent }],
  });
  if (response.stop_reason === "refusal") throw new Error("성과 추출이 거부되었습니다.");

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return parseCandidates(text);
}

export { parseCandidates };
