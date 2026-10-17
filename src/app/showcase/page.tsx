import Link from "next/link";
import type { Metadata } from "next";
import { loadShowcase } from "./data";
import styles from "./showcase.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Showcase",
  description: "공개 포트폴리오",
};

// 섹션 틀은 내용이 없어도 항상 보인다(내 정보를 아직 안 채웠어도 구성을 알 수 있게).
// 빈 섹션은 방문자에게 보이는 중립 문구로 채운다.
function Empty({ children }: { children: React.ReactNode }) {
  return <p className={styles.emptyBox}>{children}</p>;
}

export default async function ShowcasePage() {
  const { profile, projects, achievements } = await loadShowcase();
  const projById = new Map(projects.map((p) => [p.id, p]));
  const starred = achievements.filter((a) => a.star);
  const featured = starred.length ? starred : achievements.slice(0, 3);

  return (
    <main className={styles.shell}>
      <nav className={styles.nav}>
        <span className={styles.brand}>Showcase</span>
        <Link href="/showcase" className={styles.navLink} aria-current="page">
          홈
        </Link>
        <Link href="/showcase/achievements" className={styles.navLink}>
          성과
        </Link>
      </nav>

      <section className={styles.hero}>
        {profile.intro ? (
          <p className={styles.intro}>{profile.intro}</p>
        ) : (
          <Empty>소개가 아직 등록되지 않았습니다.</Empty>
        )}
      </section>

      <section className={styles.sec}>
        <h2 className={styles.secHead}>기술 스택</h2>
        {profile.techStack.length ? (
          <div className={styles.stackGrid}>
            {profile.techStack.map((g, i) => (
              <div key={i} className={styles.stackCol}>
                {g.label ? <div className={styles.sk}>{g.label}</div> : null}
                <div className={styles.techRow}>
                  {g.items.map((t) => (
                    <span key={t} className={styles.chip}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>등록된 기술 스택이 없습니다.</Empty>
        )}
      </section>

      <section className={styles.sec}>
        <h2 className={styles.secHead}>경력</h2>
        {profile.career.length ? (
          <ul className={styles.plain}>
            {profile.career.map((c) => (
              <li key={c.id} className={styles.careerItem}>
                <div className={styles.careerTop}>
                  <span className={styles.careerName}>
                    {[c.org, c.role].filter(Boolean).join(" · ")}
                  </span>
                  {c.period ? <span className={styles.period}>{c.period}</span> : null}
                </div>
                {c.note ? <div className={styles.oneLine}>{c.note}</div> : null}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>등록된 경력이 없습니다.</Empty>
        )}
      </section>

      <section className={styles.sec}>
        <h2 className={styles.secHead}>프로젝트</h2>
        {projects.length ? (
          <div className={styles.projGrid}>
            {projects.map((p) => (
              <div key={p.id} className={styles.projCard}>
                <div className={styles.careerTop}>
                  <span className={styles.careerName}>{p.name}</span>
                  {p.period ? <span className={styles.period}>{p.period}</span> : null}
                </div>
                {p.description ? <div className={styles.oneLine}>{p.description}</div> : null}
              </div>
            ))}
          </div>
        ) : (
          <Empty>등록된 프로젝트가 없습니다.</Empty>
        )}
      </section>

      <section className={styles.sec}>
        <div className={styles.secRow}>
          <h2 className={styles.secHead}>{starred.length ? "⭐ 대표 성과" : "최근 성과"}</h2>
          {achievements.length ? (
            <Link href="/showcase/achievements" className={styles.seeall}>
              성과 전체 보기 →
            </Link>
          ) : null}
        </div>
        {featured.length ? (
          <ul className={styles.plain}>
            {featured.map((a) => {
              const line = a.result || a.approach || a.problem;
              const proj = a.projectId ? projById.get(a.projectId) : undefined;
              return (
                <li key={a.id} className={styles.featItem}>
                  <div className={styles.featTop}>
                    <span className={styles.ftitle}>{a.title}</span>
                    {a.theme ? <span className={styles.themeChip}>{a.theme}</span> : null}
                    {proj ? <span className={styles.projChip}>📁 {proj.name}</span> : null}
                    {a.year ? <span className={styles.period}>{a.year}</span> : null}
                  </div>
                  {line ? <div className={styles.oneLine}>{line}</div> : null}
                  {a.tech.length ? (
                    <div className={styles.techRow}>
                      {a.tech.map((t) => (
                        <span key={t} className={styles.chip}>
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>공개된 성과가 없습니다.</Empty>
        )}
      </section>
    </main>
  );
}
