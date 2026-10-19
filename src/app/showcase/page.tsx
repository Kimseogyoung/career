import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { ContactRow } from "./contact-row";
import { loadShowcase } from "./data";
import { PhotoStrip } from "./photo-strip";
import { ShowcaseNav } from "./showcase-nav";
import { mediaUrl, type PublicProject } from "./types";
import styles from "./showcase.module.css";

export const dynamic = "force-dynamic";

/** 링크 공유 미리보기(카톡·슬랙 등). 이름·직함·한마디·대표 사진. */
export async function generateMetadata(): Promise<Metadata> {
  const { profile, projects } = await loadShowcase();
  const h = await headers();
  // nginx 가 Host 를 그대로 넘기고 X-Forwarded-Proto 를 덮어쓴다(X-Forwarded-Host 는 위조 가능해 쓰지 않음).
  const base = new URL(`${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "localhost"}`);
  const title = profile.name
    ? `${profile.name}${profile.headline ? ` · ${profile.headline}` : ""}`
    : "Showcase";
  const description = profile.intro?.split("\n")[0] || "공개 포트폴리오";
  const cover = projects.find((p) => p.photos.length);
  const images = cover
    ? [{ url: mediaUrl(cover.id, cover.photos[0]!.id), width: cover.photos[0]!.width, height: cover.photos[0]!.height }]
    : undefined;
  return {
    metadataBase: base,
    title,
    description,
    openGraph: { title, description, type: "profile", url: "/showcase", images },
    twitter: { card: images ? "summary_large_image" : "summary", title, description },
  };
}

// 섹션 틀은 내용이 없어도 항상 보인다(내 정보를 아직 안 채웠어도 구성을 알 수 있게).
function Empty({ children }: { children: React.ReactNode }) {
  return <p className={styles.emptyBox}>{children}</p>;
}

function ProjectPeriod({ p }: { p: PublicProject }) {
  if (!p.start?.date && p.legacyPeriod) return <span className={styles.per}>{p.legacyPeriod}</span>;
  if (!p.start && !p.end) return null;
  return (
    <span className={styles.per}>
      {p.start?.date}
      {p.start?.note ? <em> {p.start.note}</em> : null}
      {p.end ? (
        <>
          {" – "}
          {p.end.ongoing ? (
            <em>{p.end.note || "진행 중"}</em>
          ) : (
            <>
              {p.end.date}
              {p.end.note ? <em> {p.end.note}</em> : null}
            </>
          )}
        </>
      ) : null}
    </span>
  );
}

export default async function ShowcasePage() {
  const { profile, projects, achievements } = await loadShowcase();
  const projById = new Map(projects.map((p) => [p.id, p]));
  const starred = achievements.filter((a) => a.star);
  const featured = starred.length ? starred : achievements.slice(0, 3);

  return (
    <main className={styles.shell}>
      <ShowcaseNav current="home" brand={profile.name} />

      {profile.name || profile.headline ? (
        <header className={styles.who}>
          {profile.name ? <h1 className={styles.whoName}>{profile.name}</h1> : null}
          {profile.headline ? <p className={styles.whoTitle}>{profile.headline}</p> : null}
        </header>
      ) : null}
      <ContactRow emailEncoded={profile.emailEncoded} links={profile.links} />

      <section className={styles.sec}>
        <h2 className={styles.secHead}>한마디</h2>
        {profile.intro ? (
          <p className={styles.intro}>{profile.intro}</p>
        ) : (
          <Empty>한마디가 아직 등록되지 않았습니다.</Empty>
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
        <h2 className={styles.secHead}>
          경력
          {profile.totalCareer ? <small className={styles.secSub}>총 {profile.totalCareer}</small> : null}
        </h2>
        {profile.career.length ? (
          <ol className={styles.timeline}>
            {profile.career.map((c) => (
              <li key={c.id} className={c.current ? styles.tlCurrent : undefined}>
                <div className={styles.tlWhen}>
                  {c.start ? (
                    <>
                      {c.start} – {c.current ? "현재" : (c.end ?? "")}
                      {c.duration ? <span className={styles.tlDur}> · {c.duration}</span> : null}
                    </>
                  ) : (
                    c.legacyPeriod
                  )}
                  {c.current ? <span className={styles.tlBadge}>재직 중</span> : null}
                </div>
                <div className={styles.tlOrg}>
                  {c.org}
                  {c.role ? <span className={styles.tlRole}> · {c.role}</span> : null}
                </div>
                {c.note ? <p className={styles.tlNote}>{c.note}</p> : null}
              </li>
            ))}
          </ol>
        ) : (
          <Empty>등록된 경력이 없습니다.</Empty>
        )}
      </section>

      <section className={styles.sec}>
        <h2 className={styles.secHead}>프로젝트</h2>
        {projects.length ? (
          <div className={styles.projList}>
            {projects.map((p) => (
              <article key={p.id} className={styles.projCard}>
                <div className={styles.projTop}>
                  <h3 className={styles.projName}>{p.name}</h3>
                  <ProjectPeriod p={p} />
                </div>
                {p.org ? <div className={styles.projOrg}>{p.org}</div> : null}
                {p.description ? <p className={styles.oneLine}>{p.description}</p> : null}
                <PhotoStrip projectId={p.id} projectName={p.name} photos={p.photos} />
                {p.achievementCount ? (
                  <Link
                    href={`/showcase/achievements?view=project#p-${p.id}`}
                    className={styles.seeall}
                  >
                    관련 성과 {p.achievementCount}건 →
                  </Link>
                ) : null}
              </article>
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
                    {a.theme || proj || a.year ? (

                      <div className={styles.metaLine}>

                        {a.theme ? <span>{a.theme}</span> : null}

                        {proj ? <span>{proj.name}</span> : null}

                        {a.year ? <span>{a.year}</span> : null}

                      </div>

                    ) : null}
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
