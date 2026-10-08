"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { applyTheme, readTheme, saveTheme, type Theme } from "@/lib/theme";
import styles from "./site-header.module.css";

// 1차 네비는 홈·일지만. 설정은 오른쪽 톱니 버튼으로, 그 왼쪽에 도움말(?)·테마 토글.
// 로그인·빠른입력 화면에서는 헤더를 숨긴다.
const NAV = [
  { href: "/", label: "홈", match: (p: string) => p === "/" },
  { href: "/journal", label: "일지", match: (p: string) => p.startsWith("/journal") },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<Theme>("system");
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(readTheme());
  }, []);

  useEffect(() => {
    if (!helpOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setHelpOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [helpOpen]);

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
    <>
      <header className={styles.header}>
        <div className={styles.inner}>
          <Link href="/" className={styles.brand}>
            Career Log
          </Link>
          <nav className={styles.nav} aria-label="주 메뉴">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={styles.navItem}
                data-on={n.match(pathname)}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className={styles.actions}>
            <button
              className={styles.iconBtn}
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

            <button
              className={styles.iconBtn}
              onClick={() => setHelpOpen(true)}
              aria-label="도움말"
              title="도움말"
            >
              <span className={styles.q} aria-hidden="true">
                ?
              </span>
            </button>

            <Link
              href="/settings"
              className={styles.iconBtn}
              data-on={pathname.startsWith("/settings")}
              aria-label="설정"
              title="설정"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V15z" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      {helpOpen ? <HelpModal onClose={() => setHelpOpen(false)} /> : null}
    </>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="도움말"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.dialogHead}>
          <h2 className={styles.dialogTitle}>도움말</h2>
          <button className={styles.close} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div className={styles.helpBody}>
          <h3>기록하기</h3>
          <p>
            <b>일지</b>에서 날짜를 열고 <b>+ 기록 추가</b>로 새 기록을 씁니다. 카드를 누르면 수정·삭제.
          </p>
          <h3>일 보기(타임라인)</h3>
          <p>
            시간 순서로 카드가 흐릅니다. 내용은 3줄까지 보이고 길면 <b>더보기</b>로 펼칩니다. 시간이
            겹치면 열로 나뉘고, 기록 없는 새벽·밤은 접혀 있습니다.
          </p>
          <h3>빠른 입력</h3>
          <p>
            새 기록에서 <b>최근 활동 칩</b>과 <b>직전과 동일</b>로 반복 입력을 줄입니다. 같은 내용이
            시간상 맞닿으면 자동으로 한 기록으로 합쳐집니다.
          </p>
          <h3>요약</h3>
          <p>일·주·월 요약이 자동 생성됩니다. 각 화면에서 직접 생성·편집도 할 수 있습니다.</p>
          <h3>알림</h3>
          <p>
            <b>설정(톱니)</b>에서 “이 기기에서 알림 켜기”. 평일 09–18시 정시에 아직 기록하지 않은
            시간을 알려줍니다. 아이폰은 <b>홈 화면에 추가</b> 후 켜세요.
          </p>
        </div>
      </div>
    </div>
  );
}
