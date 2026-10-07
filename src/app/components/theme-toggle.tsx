"use client";

import { useEffect, useState } from "react";
import { applyTheme, readTheme, saveTheme, type Theme } from "@/lib/theme";
import styles from "./theme-toggle.module.css";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "시스템" },
  { value: "light", label: "라이트" },
  { value: "dark", label: "다크" },
];

// 시스템/라이트/다크 3선택 세그먼트. variant="compact" 는 헤더용 축약.
export function ThemeToggle({ variant = "full" }: { variant?: "full" | "compact" }) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    // SSR·초기 렌더는 "system"(하이드레이션 일치), 마운트 후 저장값을 반영한다.
    // 실제 테마는 이미 <head> 인라인 스크립트가 적용했고 여기선 표시만 맞춘다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(readTheme());
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    saveTheme(next);
    applyTheme(next);
  }

  return (
    <div
      className={`${styles.seg} ${variant === "compact" ? styles.compact : ""}`}
      role="group"
      aria-label="테마"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          className={styles.opt}
          data-on={theme === o.value}
          onClick={() => choose(o.value)}
          aria-pressed={theme === o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
