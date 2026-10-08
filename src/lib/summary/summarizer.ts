import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SummaryPrompts } from "@/lib/store/types";
import { resolveGuide, resolveSystem, type SummaryScope } from "./prompts";

// 업무 일지 요약 생성. ANTHROPIC_API_KEY 가 없으면 null 을 돌려주고,
// 호출 측은 "수동 작성" 폴백으로 처리한다(외부 의존이 기록 기능을 막지 않는다 — 제약 6).
// 프롬프트 문구는 prompts.ts 기본값 + 설정(summaryPrompts) 오버라이드.

export type { SummaryScope };

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

/** 요약 가능한가(= API 키가 있는가). UI 가 '자동 생성' 버튼 노출 여부를 정할 때 쓴다. */
export function canGenerate(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * 요약 초안을 생성한다. 키가 없으면 null.
 * @param body 요약 대상 텍스트(그 기간의 엔트리 또는 하위 요약을 조립한 것)
 */
export async function generateSummary(
  scope: SummaryScope,
  periodLabel: string,
  body: string,
  prompts?: SummaryPrompts,
): Promise<string | null> {
  if (!canGenerate()) return null;
  if (!body.trim()) return null; // 기록이 없으면 요약하지 않는다

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    system: resolveSystem(prompts),
    messages: [
      {
        role: "user",
        content: `기간: ${periodLabel}\n지침: ${resolveGuide(scope, prompts)}\n\n--- 기록 ---\n${body}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("요약 생성이 거부되었습니다.");
  }
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return text || null;
}
