// 요약 입력 텍스트 조립. 각 기간 범위의 하위 데이터를 사람이 읽을 수 있는 형태로 모은다.
import type { DayRecord, Summary } from "@/lib/store/types";

/** 하루 엔트리들을 요약 입력 텍스트로. */
export function dayBody(day: DayRecord, categoryLabel: (id: string) => string): string {
  return day.entries
    .map((e) => {
      const tags = e.tags.length ? ` [${e.tags.join(", ")}]` : "";
      return `${e.start}-${e.end} (${categoryLabel(e.category)})${tags}: ${e.content}`;
    })
    .join("\n");
}

/** 하위 요약(일/주)들을 상위 요약(주/월) 입력 텍스트로. */
export function rollupBody(items: { label: string; summary?: Summary | null }[]): string {
  return items
    .filter((it) => it.summary?.text?.trim())
    .map((it) => `[${it.label}]\n${it.summary!.text.trim()}`)
    .join("\n\n");
}
