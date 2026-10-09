// 요약 프롬프트 기본값. 코드(summarizer)에서 분리했다.
// 설정(settings.summaryPrompts)에 값이 있으면 그걸 쓰고, 비면 이 기본값으로 폴백한다.
import type { AchievementPrompts, SummaryPrompts } from "@/lib/store/types";

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

// ── 성과 추출 프롬프트 ──────────────────────────────────────────────
// system 은 "무엇을 성과로 볼지·톤"이라 설정에서 편집 가능.
// JSON 출력 형식(ACHIEVEMENT_FORMAT)은 앱이 파싱하므로 코드 고정(편집 불가).

export const ACHIEVEMENT_SYSTEM = [
  "너는 업무 일지에서 '성과'를 뽑아내는 도우미다. 이력서·포트폴리오의 근거가 될 성과만",
  "골라, 기록에 있는 사실로만 정리한다.",
  "- 기록에 없는 내용·수치를 지어내지 마라. 과장 금지.",
  "- 단순 일과·회의·반복 작업은 성과가 아니다. 무엇을 개선·구축·해결했고 왜 의미 있는지가",
  "  드러나는 것만 고른다.",
  "- 성과마다 '가능한 만큼만' 상세를 채운다. 기록에서 문제·접근·결과·기술을 뽑을 수 있으면",
  "  채우고(심화), 없으면 제목만 둔다(요약). 억지로 만들지 마라.",
  "- 기술적 설명과 사용 기술(구체 기술명)을 살려라.",
  "- 비슷한 기록은 하나의 성과로 묶어라.",
].join("\n");

export const ACHIEVEMENT_THEMES = [
  "아키텍처",
  "콘텐츠·기능",
  "성능·DB",
  "통신·네트워크",
  "운영·모니터링",
  "인프라·배포",
  "보안·어뷰징",
  "협업",
] as const;

/** JSON 출력 형식. 앱이 파싱하므로 고정. */
export const ACHIEVEMENT_FORMAT = [
  "아래 기록에서 성과 후보를 JSON 배열로만 출력하라. 각 항목:",
  "{",
  '  "title": 한 줄 요약(필수),',
  '  "problem": 상황/문제(있을 때만),',
  '  "approach": 접근·방법 — 어떤 기술을 왜(있을 때만),',
  '  "result": 결과·효과, 수치 있으면 포함(있을 때만),',
  '  "tech": 사용 기술 문자열 배열(있을 때만),',
  `  "theme": 다음 중 가장 가까운 것 — ${ACHIEVEMENT_THEMES.join(" / ")},`,
  '  "sourceDates": 근거가 된 날짜(YYYY-MM-DD) 배열',
  "}",
  "problem·approach·result·tech 는 기록에서 확인될 때만 넣는다. JSON 외 다른 말은 쓰지 마라.",
].join("\n");

export function resolveAchievementSystem(custom?: AchievementPrompts): string {
  return custom?.system?.trim() || ACHIEVEMENT_SYSTEM;
}
