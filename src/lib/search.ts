// 전체 기간 검색. 데이터가 작으므로(1인·수년=수백KB~MB) 별도 검색엔진/RDB 없이
// 서버 인메모리 MiniSearch 인덱스로 처리한다. 한국어는 단어 경계가 약해, 공백으로 끊은 뒤
// 통단어 + 2글자 n-gram 으로 토큰화해 부분일치를 흉내 낸다. (ADR 참조)
import MiniSearch from "minisearch";
import type { CategoryId, Entry } from "@/lib/store/types";

export interface DayEntry extends Entry {
  date: string; // YYYY-MM-DD (엔트리가 속한 날)
}

export interface SearchCriteria {
  q?: string;
  categories?: CategoryId[];
  tags?: string[]; // OR 매칭
  from?: string; // YYYY-MM-DD 포함
  to?: string; // YYYY-MM-DD 포함
}

function ngrams(s: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i + n <= s.length; i++) out.push(s.slice(i, i + n));
  return out;
}

/** 소문자화 → 공백/구두점으로 분할 → 통단어(2글자 이하) 또는 통단어+2gram. 색인·검색에 동일 적용. */
export function tokenize(text: string): string[] {
  const chunks = text.toLowerCase().split(/[\s,./·|()[\]{}#]+/).filter(Boolean);
  const toks: string[] = [];
  for (const w of chunks) {
    if (w.length <= 2) toks.push(w);
    else {
      toks.push(w);
      for (const g of ngrams(w, 2)) toks.push(g);
    }
  }
  return toks;
}

interface IndexDoc extends DayEntry {
  tagText: string;
}

function buildIndex(entries: DayEntry[]): MiniSearch<IndexDoc> {
  const mini = new MiniSearch<IndexDoc>({
    fields: ["content", "tagText"],
    storeFields: ["date", "category", "tags", "start", "end", "content"],
    tokenize,
    searchOptions: { tokenize, combineWith: "AND", prefix: false, fuzzy: false },
  });
  mini.addAll(entries.map((e) => ({ ...e, tagText: e.tags.join(" ") })));
  return mini;
}

// 같은 데이터면 인덱스를 재사용(프로세스 전역). 데이터가 바뀌면 시그니처가 달라져 자동 재빌드.
interface SearchCache {
  sig: string;
  mini: MiniSearch<IndexDoc>;
}
const g = globalThis as typeof globalThis & { __careerSearch?: SearchCache };

function signature(entries: DayEntry[]): string {
  let latest = "";
  for (const e of entries) if (e.updatedAt > latest) latest = e.updatedAt;
  return `${entries.length}:${latest}`;
}

function indexFor(entries: DayEntry[]): MiniSearch<IndexDoc> {
  const sig = signature(entries);
  if (g.__careerSearch && g.__careerSearch.sig === sig) return g.__careerSearch.mini;
  const mini = buildIndex(entries);
  g.__careerSearch = { sig, mini };
  return mini;
}

/** 전체 엔트리에 조건을 적용해 결과를 돌려준다. q 가 있으면 관련도순, 없으면 날짜 내림차순. */
export function runSearch(entries: DayEntry[], c: SearchCriteria): DayEntry[] {
  const inRange = (d: string) => (!c.from || d >= c.from) && (!c.to || d <= c.to);
  const catOk = (e: DayEntry) => !c.categories?.length || c.categories.includes(e.category);
  const tagOk = (e: DayEntry) => !c.tags?.length || e.tags.some((t) => c.tags!.includes(t));
  const base = entries.filter((e) => inRange(e.date) && catOk(e) && tagOk(e));

  const q = (c.q ?? "").trim();
  if (!q) {
    return base.sort((a, b) =>
      a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.start < b.start ? 1 : -1,
    );
  }

  const mini = indexFor(entries);
  const baseIds = new Set(base.map((e) => e.id));
  const byId = new Map(entries.map((e) => [e.id, e]));
  return mini
    .search(q)
    .filter((r) => baseIds.has(r.id as string))
    .map((r) => byId.get(r.id as string))
    .filter((e): e is DayEntry => Boolean(e));
}
