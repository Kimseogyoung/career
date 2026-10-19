import type { PortfolioDoc } from "@/lib/export/portfolio";
import { nowKstIso } from "@/lib/time";
import type { Achievement, ResumeMeta } from "@/lib/store/types";
import { mediaUrl } from "@/app/showcase/types";
import styles from "./export.module.css";

// 포트폴리오 종이 한 장. 지금 조립본과 저장본이 같은 모양으로 그려진다.

function AchievementBlock({ a }: { a: Achievement }) {
  const rows = [
    ["문제", a.problem],
    ["접근", a.approach],
    ["결과", a.result],
  ].filter((r): r is [string, string] => Boolean(r[1]));
  return (
    <div className={styles.ach}>
      <h4 className={styles.achTitle}>{a.title}</h4>
      {rows.length ? (
        <dl className={styles.achRows}>
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {a.tech.length ? <p className={styles.achTech}>{a.tech.join(" · ")}</p> : null}
    </div>
  );
}

export function PortfolioPaper({ doc }: { doc: PortfolioDoc }) {
  const { profile } = doc;
  const contacts = [
    profile.email,
    ...(profile.links ?? []).map((l) => `${l.label} ${l.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}`),
  ].filter(Boolean);
  return (
    <article className={styles.paper}>
      <header className={styles.head}>
        <h1>{profile.name || "포트폴리오"}</h1>
        {profile.headline ? <p className={styles.headline}>{profile.headline}</p> : null}
        {contacts.length ? <p className={styles.contacts}>{contacts.join("   ·   ")}</p> : null}
        {profile.intro ? <p className={styles.intro}>{profile.intro}</p> : null}
        {profile.techStack.length ? (
          <dl className={styles.stack}>
            {profile.techStack.map((g, i) => (
              <div key={i}>
                <dt>{g.label || "기술"}</dt>
                <dd>{g.items.join(", ")}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </header>

      {doc.career.length ? (
        <section className={styles.group}>
          <h2 className={styles.groupHead}>
            <span>경력</span>
          </h2>
          {doc.career.map((c) => (
            <div key={c.id} className={styles.career}>
              <div className={styles.projHead}>
                <span>
                  {c.org || "(회사명 없음)"}
                  {c.role ? <small> · {c.role}</small> : null}
                </span>
                {c.period ? <span className={styles.when}>{c.period}</span> : null}
              </div>
              {c.note ? <p className={styles.desc}>{c.note}</p> : null}
            </div>
          ))}
        </section>
      ) : null}

      {doc.projects.length ? (
        <section className={styles.group}>
          <h2 className={styles.groupHead}>
            <span>프로젝트</span>
          </h2>
          {doc.projects.map((p) => (
            <div key={p.id} className={styles.proj}>
              <h3 className={styles.projHead}>
                <span>{p.name}</span>
                <span className={styles.when}>{[p.org, p.period].filter(Boolean).join(" · ")}</span>
              </h3>
              {p.description ? <p className={styles.desc}>{p.description}</p> : null}
              {p.photos.length ? (
                <div className={styles.photos}>
                  {p.photos.map((ph) => (
                    <figure key={ph.id}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={mediaUrl(p.id, ph.id)} alt={ph.caption || p.name} />
                      {ph.caption ? <figcaption>{ph.caption}</figcaption> : null}
                    </figure>
                  ))}
                </div>
              ) : null}
              {p.achievements.map((a) => (
                <AchievementBlock key={a.id} a={a} />
              ))}
            </div>
          ))}
        </section>
      ) : null}

      {doc.loose.length ? (
        <section className={styles.group}>
          <h2 className={styles.groupHead}>
            <span>기타 성과</span>
          </h2>
          {doc.loose.map((a) => (
            <AchievementBlock key={a.id} a={a} />
          ))}
        </section>
      ) : null}
    </article>
  );
}

/** 저장 시각(ISO) → KST "2026.10.19 14:30". */
export function savedAtText(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const k = nowKstIso(new Date(t));
  return `${k.slice(0, 10).replace(/-/g, ".")} ${k.slice(11, 16)}`;
}

/** "⭐만 · 사진 빼기" / "전체" */
export function scopeText(m: ResumeMeta): string {
  return [m.options.starOnly ? "⭐만" : "전체", m.options.photos ? null : "사진 빼기"].filter(Boolean).join(" · ");
}

/** "⭐만 · 사진 빼기 · 프로젝트 3 · 성과 12" */
export function resumeSummary(m: ResumeMeta): string {
  return `${scopeText(m)} · 프로젝트 ${m.counts.projects} · 성과 ${m.counts.achievements}`;
}
