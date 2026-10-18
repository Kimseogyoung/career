import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import styles from "./showcase.module.css";

/**
 * 공개 Showcase 상단 메뉴. 오른쪽 버튼은 보는 사람에 따라 다르다 —
 * 주인이 로그인한 상태면 "앱으로", 방문자면 "로그인".
 */
export async function ShowcaseNav({
  current,
  brand,
}: {
  current: "home" | "achievements";
  brand?: string;
}) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const owner = token ? await verifySessionToken(token) : null;

  return (
    <nav className={styles.nav}>
      <Link href="/showcase" className={styles.brand}>
        {brand || "Showcase"}
      </Link>
      <Link
        href="/showcase"
        className={styles.navLink}
        aria-current={current === "home" ? "page" : undefined}
      >
        홈
      </Link>
      <Link
        href="/showcase/achievements"
        className={styles.navLink}
        aria-current={current === "achievements" ? "page" : undefined}
      >
        성과
      </Link>
      <span className={styles.navPush} />
      {owner ? (
        <Link href="/" className={styles.navBtn}>
          ← 앱으로
        </Link>
      ) : (
        <Link href="/login" className={styles.navBtn}>
          로그인
        </Link>
      )}
    </nav>
  );
}
