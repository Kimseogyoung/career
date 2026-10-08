"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Category } from "@/lib/store/types";
import styles from "./search.module.css";

interface Props {
  categories: Category[];
  initial: { q: string; cat: string[]; tag: string; from: string; to: string };
}

export function SearchForm({ categories, initial }: Props) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q);
  const [cat, setCat] = useState<Set<string>>(new Set(initial.cat));
  const [tag, setTag] = useState(initial.tag);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  function toggleCat(id: string) {
    setCat((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    for (const c of cat) params.append("cat", c);
    if (tag.trim()) params.set("tag", tag.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    router.push(`/search?${params.toString()}`);
  }

  function reset() {
    setQ("");
    setCat(new Set());
    setTag("");
    setFrom("");
    setTo("");
    router.push("/search");
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <input
        className={styles.q}
        placeholder="내용·태그 검색 (전체 기간)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      <div className={styles.cats}>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={styles.catChip}
            data-on={cat.has(c.id)}
            style={{ ["--cat" as string]: c.color }}
            onClick={() => toggleCat(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className={styles.rows}>
        <input
          className={styles.tag}
          placeholder="태그 (쉼표로 구분)"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
        <div className={styles.range}>
          <input
            className={styles.date}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="시작일"
          />
          <span className={styles.dash}>–</span>
          <input
            className={styles.date}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="종료일"
          />
        </div>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.reset} onClick={reset}>
          초기화
        </button>
        <button type="submit" className={styles.submit}>
          검색
        </button>
      </div>
    </form>
  );
}
