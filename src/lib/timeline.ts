// 일 보기 타임라인 레이아웃 계산(순수 함수). 저장 형태는 바꾸지 않고, 분 단위 start/end 로
// 위치·높이·겹침 열을 계산한다. 화면 픽셀 환산(시간당 높이)은 렌더러가 맡는다.
import type { CategoryId, DayRecord, Entry, RecordingHours } from "@/lib/store/types";

const DAY = 1440;

/** "HH:MM" → 분(0..1440). */
export function toMin(hhmm: string): number {
  const h = Number(hhmm.slice(0, 2));
  const m = Number(hhmm.slice(3, 5));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** 분 → "HH:MM". 24:00 이상은 23:59 로 자른다(자정 넘김은 다루지 않음). */
export function fromMin(min: number): string {
  const m = Math.max(0, Math.min(DAY - 1, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** 끝 시각(분). 길이가 0 이하면 최소 1분으로 보정. */
function endMinOf(e: Entry): number {
  const start = toMin(e.start);
  const end = toMin(e.end);
  return end <= start ? start + 1 : end;
}

export interface LaidOutEntry {
  entry: Entry;
  top: number; // 분(0..1440)
  height: number; // 분(>=1)
  col: number; // 묶음 내 열 인덱스
  ncols: number; // 묶음 전체 열 수
  clusterId: number;
  overflow: boolean; // 열이 4개 이상이고 col>=3 이면 접힘(배지로 노출)
}

export interface Cluster {
  id: number;
  top: number; // 분
  overflowCount: number; // col>=3 로 접힌 개수
  entries: Entry[]; // 묶음 전체(펼침 목록용), start 오름차순
}

export interface DayLayout {
  startMin: number; // 보이는 창 시작(정시 경계)
  endMin: number; // 보이는 창 끝(정시 경계)
  dawn: { from: number; to: number } | null; // 접힌 앞 구간 [0, startMin]
  eve: { from: number; to: number } | null; // 접힌 뒤 구간 [endMin, 1440]
  items: LaidOutEntry[];
  clusters: Cluster[];
}

/**
 * 겹치는 엔트리를 묶음(cluster)으로 모으고, 묶음 안에서 탐욕적으로 열을 배정한다.
 * 열 수 n: 1=단독(전체 폭), 2~3=n등분, 4이상=앞 3열만 보이고 나머지는 overflow.
 */
function assignLayout(entries: Entry[]): { items: LaidOutEntry[]; clusters: Cluster[] } {
  const sorted = [...entries].sort((a, b) => toMin(a.start) - toMin(b.start) || endMinOf(a) - endMinOf(b));
  const items: LaidOutEntry[] = [];
  const clusters: Cluster[] = [];
  let i = 0;
  let clusterId = 0;

  while (i < sorted.length) {
    // 묶음 만들기: 다음 엔트리 시작이 현재 묶음 끝보다 이르면 같은 묶음
    const group: Entry[] = [sorted[i]!];
    let clusterEnd = endMinOf(sorted[i]!);
    let j = i + 1;
    while (j < sorted.length && toMin(sorted[j]!.start) < clusterEnd) {
      group.push(sorted[j]!);
      clusterEnd = Math.max(clusterEnd, endMinOf(sorted[j]!));
      j++;
    }

    // 탐욕적 열 배정(최소 열 수 = 최대 동시 겹침)
    const colEnds: number[] = [];
    const colOf = new Map<string, number>();
    for (const e of group) {
      const s = toMin(e.start);
      let placed = -1;
      for (let c = 0; c < colEnds.length; c++) {
        if (colEnds[c]! <= s) {
          placed = c;
          colEnds[c] = endMinOf(e);
          break;
        }
      }
      if (placed === -1) {
        placed = colEnds.length;
        colEnds.push(endMinOf(e));
      }
      colOf.set(e.id, placed);
    }
    const ncols = colEnds.length;

    let overflowCount = 0;
    for (const e of group) {
      const col = colOf.get(e.id)!;
      const overflow = ncols > 3 && col >= 3;
      if (overflow) overflowCount++;
      items.push({
        entry: e,
        top: toMin(e.start),
        height: endMinOf(e) - toMin(e.start),
        col,
        ncols,
        clusterId,
        overflow,
      });
    }
    if (group.length > 1) {
      clusters.push({
        id: clusterId,
        top: toMin(group[0]!.start),
        overflowCount,
        entries: [...group].sort((a, b) => toMin(a.start) - toMin(b.start)),
      });
    }
    clusterId++;
    i = j;
  }

  return { items, clusters };
}

/**
 * 하루 전체(00:00~24:00)를 기준으로, 기록 시간대 ∪ 엔트리 범위를 "보이는 창"으로 삼고
 * 그 앞뒤 빈 구간(새벽·저녁)은 접는다. 창 안의 중간 빈 시간은 열어 둔다(추가용).
 */
export function computeDayLayout(entries: Entry[], rec: RecordingHours): DayLayout {
  const { items, clusters } = assignLayout(entries);

  let minStart = toMin(rec.start);
  let maxEnd = toMin(rec.end);
  for (const it of items) {
    if (it.top < minStart) minStart = it.top;
    if (it.top + it.height > maxEnd) maxEnd = it.top + it.height;
  }

  const startMin = Math.max(0, Math.floor(minStart / 60) * 60);
  let endMin = Math.min(DAY, Math.ceil(maxEnd / 60) * 60);
  if (endMin <= startMin) endMin = Math.min(DAY, startMin + 60);

  return {
    startMin,
    endMin,
    dawn: startMin > 0 ? { from: 0, to: startMin } : null,
    eve: endMin < DAY ? { from: endMin, to: DAY } : null,
    items,
    clusters,
  };
}

export interface RecentActivity {
  category: CategoryId;
  content: string;
  tags: string[];
}

/**
 * 최근 활동(반복 칩용). upToDate 이하의 날짜에서 (카테고리+내용) 중복을 제거하고
 * 최신순으로 limit 개. 내용이 비면 제외.
 */
export function recentActivities(
  days: Record<string, DayRecord>,
  upToDate: string,
  limit = 6,
): RecentActivity[] {
  const dates = Object.keys(days)
    .filter((d) => d <= upToDate)
    .sort()
    .reverse();
  const seen = new Set<string>();
  const out: RecentActivity[] = [];
  for (const d of dates) {
    const es = [...(days[d]?.entries ?? [])].sort((a, b) => (a.start < b.start ? 1 : -1));
    for (const e of es) {
      const content = e.content.trim();
      if (!content) continue;
      const key = `${e.category}\u0000${content}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ category: e.category, content, tags: e.tags });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** start(분) 직전(또는 그 시각 이전 시작)에 있는 가장 가까운 엔트리 — "직전과 동일"용. */
export function previousEntry(entries: Entry[], beforeStartMin: number): Entry | null {
  let best: Entry | null = null;
  let bestStart = -1;
  for (const e of entries) {
    const s = toMin(e.start);
    if (s < beforeStartMin && s > bestStart) {
      best = e;
      bestStart = s;
    }
  }
  return best;
}
