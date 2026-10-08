// 요약 프롬프트 기본값. 코드(summarizer)에서 분리했다.
// 설정(settings.summaryPrompts)에 값이 있으면 그걸 쓰고, 비면 이 기본값으로 폴백한다.
import type { SummaryPrompts } from "@/lib/store/types";

export type SummaryScope = "day" | "week" | "month";

export const SUMMARY_SYSTEM = [
  "너는 사용자의 업무 일지를 요약하는 도우미다.",
  "주어진 기록을 바탕으로, 그 기간에 '무엇을 했고 무엇을 배웠는지'를 간결한 한국어로 정리한다.",
  "- 사실에 충실하라. 기록에 없는 내용을 지어내지 마라.",
  "- 나열이 아니라 흐름이 보이게 묶어라(프로젝트·주제 단위).",
  "- 나중에 경력의 근거가 되도록, 성과와 기술 키워드를 살려라.",
  "- 군더더기 인사말 없이 요약 본문만 출력하라.",
].join("\n");

export const SCOPE_GUIDE: Record<SummaryScope, string> = {
  day: "하루 동안의 시간대별 기록을 3~5문장으로 요약하라.",
  week: "한 주간의 일별 요약들을 묶어 핵심 성과 중심으로 5~8문장으로 요약하라.",
  month: "한 달간의 주별 요약들을 묶어 큰 줄기와 성과 중심으로 간결히 요약하라.",
};

/** 설정값(있으면)으로 기본 시스템 프롬프트를 대체. 공백이면 기본값. */
export function resolveSystem(custom?: SummaryPrompts): string {
  return custom?.system?.trim() || SUMMARY_SYSTEM;
}

/** 설정값(있으면)으로 범위별 지침을 대체. 공백이면 기본값. */
export function resolveGuide(scope: SummaryScope, custom?: SummaryPrompts): string {
  return custom?.[scope]?.trim() || SCOPE_GUIDE[scope];
}
