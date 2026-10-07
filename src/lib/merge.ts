// 같은 내용(시간 제외)의 연속 기록을 하나로 합친다.
// 키 = 카테고리 + 태그(정규화) + 내용(trim). 키가 같고 시간이 맞닿거나 겹치면 병합한다.
// 저장(upsert) 직후 서버에서 호출한다. 표시 로직이 아니라 실제 데이터를 합친다.
import type { Entry } from "@/lib/store/types";
import { fromMin, toMin } from "@/lib/timeline";

function endMinOf(e: Entry): number {
  const s = toMin(e.start);
  const en = toMin(e.end);
  return en <= s ? s + 1 : en;
}

/** 시간을 뺀 내용 키. 태그는 trim·중복제거·정렬해 순서 무관하게 비교한다. */
export function contentKey(e: Pick<Entry, "category" | "tags" | "content">): string {
  const tags = [...new Set(e.tags.map((t) => t.trim()).filter(Boolean))].sort();
  return JSON.stringify([e.category, tags, e.content.trim()]);
}

export interface MergePlan {
  merged: Entry; // 편집한 기록 id 유지, 시간 범위를 합침
  removeIds: string[]; // 흡수되어 지울 기록들
}

/**
 * targetId 기록을 기준으로, 같은 키이면서 시간이 맞닿거나 겹치는 기록들을 연쇄로 모아 하나로 합친다.
 * 합칠 게 없으면 null.
 */
export function mergeEntries(entries: Entry[], targetId: string, now: string): MergePlan | null {
  const target = entries.find((e) => e.id === targetId);
  if (!target) return null;

  const key = contentKey(target);
  const same = entries.filter((e) => contentKey(e) === key);

  let lo = toMin(target.start);
  let hi = endMinOf(target);
  const chain = new Set<string>([target.id]);

  // 현재 합쳐진 범위와 맞닿거나 겹치는 같은-키 기록을 더 이상 없을 때까지 흡수
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of same) {
      if (chain.has(e.id)) continue;
      const s = toMin(e.start);
      const en = endMinOf(e);
      if (s <= hi && lo <= en) {
        chain.add(e.id);
        lo = Math.min(lo, s);
        hi = Math.max(hi, en);
        changed = true;
      }
    }
  }

  if (chain.size <= 1) return null;

  const members = same.filter((e) => chain.has(e.id));
  const createdAt = members.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b)).createdAt;
  const merged: Entry = {
    ...target,
    start: fromMin(lo),
    end: fromMin(hi),
    createdAt,
    updatedAt: now,
  };
  const removeIds = members.filter((e) => e.id !== target.id).map((e) => e.id);
  return { merged, removeIds };
}
