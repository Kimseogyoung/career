"use client";

import { useMemo, useState } from "react";
import { projectPeriodLabel, type PublicAchievement, type PublicProject } from "./types";
import styles from "./showcase.module.css";

function AchievementCard({ a, proj }: { a: PublicAchievement; proj?: PublicProject }) {
  const detail = a.problem || a.approach || a.result;
  return (
    <div className={styles.acard}>
      <div className={styles.featTop}>
        <span className={styles.acardTitle}>{a.title}</span>
        {a.theme || proj || a.year ? (

          <div className={styles.metaLine}>

            {a.theme ? <span>{a.theme}</span> : null}

            {proj ? <span>{proj.name}</span> : null}

            {a.year ? <span>{a.year}</span> : null}

          </div>

        ) : null}
      </div>
      {detail ? (
        <div className={styles.detail}>
          {a.problem ? (
            <div className={styles.drow}>
              <span className={styles.dlbl}>문제</span>
              <span>{a.problem}</span>
            </div>
          ) : null}
          {a.approach ? (
            <div className={styles.drow}>
              <span className={styles.dlbl}>접근</span>
              <span>{a.approach}</span>
            </div>
          ) : null}
          {a.result ? (
            <div className={styles.drow}>
              <span className={styles.dlbl}>결과</span>
              <span>{a.result}</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {a.tech.length ? (
        <div className={styles.techRow}>
          {a.tech.map((t) => (
            <span key={t} className={styles.chip}>
              {t}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface ProjectGroup {
  key: string;
  label: string;
  period?: string;
  desc?: string;
  items: PublicAchievement[];
}

export function ShowcaseAchievements({
  achievements,
  projects,
  initialView = "theme",
}: {
  achievements: PublicAchievement[]; // 서버에서 hidden 제외·최신순 정렬·허용 필드만
  projects: PublicProject[]; // 최신순
  initialView?: "theme" | "project";
}) {
  const [view, setView] = useState<"theme" | "project">(initialView);
  const projById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const themeGroups = useMemo(() => {
    const m = new Map<string, PublicAchievement[]>();
    for (const a of achievements) {
      const k = a.theme || "기타";
      const arr = m.get(k);
      if (arr) arr.push(a);
      else m.set(k, [a]);
    }
    return [...m.entries()];
  }, [achievements]);

  const projectGroups = useMemo(() => {
    const m = new Map<string, PublicAchievement[]>();
    for (const a of achievements) {
      const k = a.projectId ?? "__none"; // 서버에서 존재하는 프로젝트로만 정규화됨
      const arr = m.get(k);
      if (arr) arr.push(a);
      else m.set(k, [a]);
    }
    const out: ProjectGroup[] = [];
    for (const p of projects) {
      const items = m.get(p.id);
      if (items)
        out.push({ key: p.id, label: p.name, period: projectPeriodLabel(p), desc: p.description, items });
    }
    const none = m.get("__none");
    if (none) out.push({ key: "__none", label: "기타", items: none });
    return out;
  }, [achievements, projects]);

  if (achievements.length === 0) {
    return <p className={styles.empty}>아직 공개된 성과가 없습니다.</p>;
  }

  return (
    <div>
      <div className={styles.toggle}>
        <button type="button" aria-pressed={view === "theme"} onClick={() => setView("theme")}>
          테마별
        </button>
        <button type="button" aria-pressed={view === "project"} onClick={() => setView("project")}>
          프로젝트별
        </button>
      </div>

      {view === "theme"
        ? themeGroups.map(([theme, items]) => (
            <div key={theme} className={styles.group}>
              <div className={styles.groupHead}>{theme}</div>
              {items.map((a) => (
                <AchievementCard
                  key={a.id}
                  a={a}
                  proj={a.projectId ? projById.get(a.projectId) : undefined}
                />
              ))}
            </div>
          ))
        : projectGroups.map((g) => (
            <div key={g.key} id={`p-${g.key}`} className={styles.group}>
              <div className={styles.projHead}>
                <span className={styles.groupHead}>{g.label}</span>
                {g.period ? <span className={styles.period}>{g.period}</span> : null}
              </div>
              {g.desc ? <div className={styles.groupDesc}>{g.desc}</div> : null}
              {g.items.map((a) => (
                <AchievementCard key={a.id} a={a} />
              ))}
            </div>
          ))}
    </div>
  );
}
