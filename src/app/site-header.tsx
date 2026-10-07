"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { applyTheme, readTheme, saveTheme, type Theme } from "@/lib/theme";
import styles from "./site-header.module.css";

// 1차 네비(홈·일지·설정) + 해/달 테마 토글. 로그인·빠른입력 화면에서는 숨긴다.
const NAV = [
  { href: "/", label: "홈", match: (p: string) => p === "/" },
  { href: "/journal", label: "일지", match: (p: string) => p.startsWith("/journal") },
  { href: "/settings", label: "설정", match: (p: string) => p.startsWith("/settings") },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(readTheme());
  }, []);

  if (pathname === "/login" || pathname.startsWith("/quick")) return null;

  // 해/달 토글: 현재 효과 테마의 반대로 전환(명시값 저장).
  function toggle() {
    const effectiveDark =
      theme === "dark" ||
      (theme === "system" &&
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    const next: Theme = effectiveDark ? "light" : "dark";
    setTheme(next);
    saveTheme(next);
    applyTheme(next);
  }

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          Career Log
        </Link>
        <nav className={styles.nav} aria-label="주 메뉴">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={styles.navItem} data-on={n.match(pathname)}>
              {n.label}
            </Link>
          ))}
        </nav>
        <button
          className={styles.theme}
          onClick={toggle}
          aria-label="라이트/다크 전환"
          title="라이트/다크 전환"
        >
          <svg
            className={styles.sun}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19" />
          </svg>
          <svg className={styles.moon} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
