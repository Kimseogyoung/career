// 요청 본문 검증. 외부 의존성(zod 등) 없이 손으로 좁게 검증한다.
import type { CategoryId, Entry } from "@/lib/store/types";

const CATEGORIES: readonly CategoryId[] = ["work", "study", "meeting", "side", "etc"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidDate(date: unknown): date is string {
  if (typeof date !== "string" || !DATE_RE.test(date)) return false;
  // 형식뿐 아니라 실제 달력상 유효한 날짜인지 확인한다(2026-13-99 같은 값 거부).
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m! - 1 && dt.getUTCDate() === d;
}

export interface EntryInput {
  start: string;
  end: string;
  category: CategoryId;
  tags: string[];
  content: string;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** 엔트리 입력 검증. id/시각 메타는 서버가 채우므로 받지 않는다. */
export function validateEntryInput(body: unknown): ValidationResult<EntryInput> {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "본문이 객체가 아닙니다." };
  }
  const b = body as Record<string, unknown>;

  if (!TIME_RE.test(String(b.start)))
    return { ok: false, error: "start 가 HH:MM 형식이 아닙니다." };
  if (!TIME_RE.test(String(b.end))) return { ok: false, error: "end 가 HH:MM 형식이 아닙니다." };
  if (String(b.end) <= String(b.start)) {
    return { ok: false, error: "end 는 start 보다 뒤여야 합니다." };
  }
  if (!CATEGORIES.includes(b.category as CategoryId)) {
    return { ok: false, error: "category 가 올바르지 않습니다." };
  }

  let tags: string[] = [];
  if (b.tags !== undefined) {
    if (!Array.isArray(b.tags) || b.tags.some((t) => typeof t !== "string")) {
      return { ok: false, error: "tags 는 문자열 배열이어야 합니다." };
    }
    // 공백 제거·중복 제거·빈 태그 제외.
    tags = [...new Set((b.tags as string[]).map((t) => t.trim()).filter(Boolean))];
  }

  const content = typeof b.content === "string" ? b.content : "";

  return {
    ok: true,
    value: {
      start: String(b.start),
      end: String(b.end),
      category: b.category as CategoryId,
      tags,
      content,
    },
  };
}

/** 입력 + 서버 메타로 완성된 Entry 를 만든다. */
export function buildEntry(input: EntryInput, id: string, now: string): Entry {
  return {
    id,
    start: input.start,
    end: input.end,
    category: input.category,
    tags: input.tags,
    content: input.content,
    createdAt: now,
    updatedAt: now,
  };
}
