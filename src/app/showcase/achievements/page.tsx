import type { Metadata } from "next";
import { loadShowcase } from "../data";
import { ShowcaseAchievements } from "../showcase-achievements";
import { ShowcaseNav } from "../showcase-nav";
import styles from "../showcase.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { profile } = await loadShowcase();
  return {
    title: profile.name ? `성과 · ${profile.name}` : "성과 · Showcase",
    description: "공개 포트폴리오 — 성과",
  };
}

export default async function ShowcaseAchievementsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { achievements, projects, profile } = await loadShowcase();
  const { view } = await searchParams;
  return (
    <main className={styles.shell}>
      <ShowcaseNav current="achievements" brand={profile.name} />
      <h1 className={styles.pageTitle}>성과</h1>
      <ShowcaseAchievements
        achievements={achievements}
        projects={projects}
        initialView={view === "project" ? "project" : "theme"}
      />
    </main>
  );
}
