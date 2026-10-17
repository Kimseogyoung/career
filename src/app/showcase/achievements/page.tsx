import Link from "next/link";
import type { Metadata } from "next";
import { loadShowcase } from "../data";
import { ShowcaseAchievements } from "../showcase-achievements";
import styles from "../showcase.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "성과 · Showcase",
  description: "공개 포트폴리오 — 성과",
};

export default async function ShowcaseAchievementsPage() {
  const { achievements, projects } = await loadShowcase();
  return (
    <main className={styles.shell}>
      <nav className={styles.nav}>
        <span className={styles.brand}>Showcase</span>
        <Link href="/showcase" className={styles.navLink}>
          홈
        </Link>
        <Link href="/showcase/achievements" className={styles.navLink} aria-current="page">
          성과
        </Link>
      </nav>
      <h1 className={styles.pageTitle}>성과</h1>
      <ShowcaseAchievements achievements={achievements} projects={projects} />
    </main>
  );
}
