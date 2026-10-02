import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// 업무 일지 요약 생성. ANTHROPIC_API_KEY 가 없으면 null 을 돌려주고,
// 호출 측은 "수동 작성" 폴백으로 처리한다(외부 의존이 기록 기능을 막지 않는다 — 제약 6).

export type SummaryScope = "day" | "week" | "month";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

const SYSTEM = [
  "너는 사용자의 업무 일지를 요약하는 도우미다.",
  "주어진 기록을 바탕으로, 그 기간에 '무엇을 했고 무엇을 배웠는지'를 간결한 한국어로 정리한다.",
  "- 사실에 충실하라. 기록에 없는 내용을 지어내지 마라.",
  "- 나열이 아니라 흐름이 보이게 묶어라(프로젝트·주제 단위).",
  "- 나중에 이력서·경력기술서의 근거가 되도록, 성과와 기술 키워드를 살려라.",
  "- 군더더기 인사말 없이 요약 본문만 출력하라.",
].join("\n");

const SCOPE_GUIDE: Record<SummaryScope, string> = {
  day: "하루 동안의 시간대별 기록을 3~5문장으로 요약하라.",
  week: "한 주간의 일별 요약들을 묶어 핵심 성과 중심으로 5~8문장으로 요약하라.",
  month: "한 달간의 주별 요약들을 묶어 큰 줄기와 성과 중심으로 간결히 요약하라.",
};

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
): Promise<string | null> {
  if (!canGenerate()) return null;
  if (!body.trim()) return null; // 기록이 없으면 요약하지 않는다

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `기간: ${periodLabel}\n지침: ${SCOPE_GUIDE[scope]}\n\n--- 기록 ---\n${body}`,
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
