"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./career.module.css";

const TABS = [
  { href: "/career", label: "성과" },
  { href: "/career/projects", label: "프로젝트" },
  { href: "/career/me", label: "내 정보" },
  { href: "/career/export", label: "내보내기" },
];

export function CareerSubnav() {
  const path = usePathname();
  return (
    <nav className={styles.subnav}>
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={styles.subnavLink}
          aria-current={path === t.href ? "page" : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
