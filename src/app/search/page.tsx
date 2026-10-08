import Link from "next/link";
import { getSettingsStore, getStore, isStoreConfigured } from "@/lib/store/instance";
import { DEFAULT_SETTINGS } from "@/lib/store/settings";
import type { ReactNode } from "react";
import { runSearch, type DayEntry } from "@/lib/search";
import { formatKoreanDate } from "@/lib/time";
import type { CategoryId } from "@/lib/store/types";
import { SearchForm } from "./search-form";
import styles from "./search.module.css";

export const dynamic = "force-dynamic";

function toArray(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v) return [v];
  return [];
}

// 검색어(사용자가 입력한 단어)를 내용에서 대소문자 무시 부분일치로 강조한다.
function highlight(text: string, terms: string[]): ReactNode {
  const esc = [...new Set(terms.map((t) => t.toLowerCase()).filter(Boolean))].map((t) =>
    t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  if (!esc.length) return text;
  const re = new RegExp(esc.join("|"), "gi");
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <mark key={k++} className={styles.hl}>
        {m[0]}
      </mark>,
    );
    last = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++; // 0길이 매칭 방지
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const cat = toArray(sp.cat);
  const tagRaw = typeof sp.tag === "string" ? sp.tag : "";
  const tags = tagRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const from = typeof sp.from === "string" ? sp.from : "";
  const to = typeof sp.to === "string" ? sp.to : "";
  const hasQuery = Boolean(q || cat.length || tags.length || from || to);

  const configured = isStoreConfigured();
  let settings = DEFAULT_SETTINGS;
  let results: DayEntry[] = [];
  let stale = false;

  if (configured) {
    try {
      const settingsStore = await getSettingsStore();
      if (settingsStore) settings = await settingsStore.get();
      if (hasQuery) {
        const store = await getStore();
        if (store) {
          const all = await store.getAllEntries();
          results = runSearch(all, {
            q,
            categories: cat as CategoryId[],
            tags,
            from: from || undefined,
            to: to || undefined,
          });
        }
      }
    } catch {
      stale = true;
    }
  }

  const catById = new Map(settings.categories.map((c) => [c.id, c]));
  const terms = q
    .split(/[\s,./·|()[\]{}#]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <main className={styles.shell}>
      <h1 className={styles.title}>검색</h1>

      {!configured ? (
        <p className={styles.banner}>원격 저장소가 설정되지 않았습니다.</p>
      ) : stale ? (
        <p className={styles.banner}>원격 저장소에 연결하지 못했습니다. 결과가 일부일 수 있습니다.</p>
      ) : null}

      <SearchForm
        categories={settings.categories}
        initial={{ q, cat, tag: tagRaw, from, to }}
      />

      {!hasQuery ? (
        <p className={styles.hint}>
          내용·태그로 전체 기간을 검색합니다. 카테고리·태그·기간으로 좁힐 수 있습니다.
        </p>
      ) : (
        <>
          <p className={styles.count}>{results.length}건</p>
          <ul className={styles.list}>
            {results.map((e) => {
              const c = catById.get(e.category);
              return (
                <li key={e.id} className={styles.item}>
                  <Link href={`/journal/day/${e.date}`} className={styles.itemLink}>
                    <div className={styles.itemHead}>
                      <span className={styles.date}>{formatKoreanDate(e.date)}</span>
                      <span className={styles.chip} style={{ ["--cat" as string]: c?.color }}>
                        {c?.label ?? e.category}
                      </span>
                      <span className={styles.time}>
                        {e.start}–{e.end}
                      </span>
                    </div>
                    {e.content ? (
                      <div className={styles.content}>
                        {terms.length ? highlight(e.content, terms) : e.content}
                      </div>
                    ) : null}
                    {e.tags.length ? (
                      <div className={styles.tags}>{e.tags.map((t) => `#${t}`).join(" ")}</div>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
          {results.length === 0 ? <p className={styles.hint}>검색 결과가 없습니다.</p> : null}
        </>
      )}
    </main>
  );
}
