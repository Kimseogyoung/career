import Link from "next/link";
import { buildPortfolio, type PortfolioDoc } from "@/lib/export/portfolio";
import { currentYearMonth } from "@/lib/period";
import {
  getAchievementStore,
  getProfileStore,
  getProjectStore,
  isStoreConfigured,
} from "@/lib/store/instance";
import { DEFAULT_PROFILE } from "@/lib/store/profile";
import type { Achievement, Project } from "@/lib/store/types";
import { todayKst } from "@/lib/time";
import { mediaUrl } from "@/app/showcase/types";
import { CareerSubnav } from "../career-subnav";
import { PrintButton } from "./print-button";
import cstyles from "../career.module.css";
import styles from "./export.module.css";

export const dynamic = "force-dynamic";

// 포트폴리오 내보내기(ROADMAP 3-1, ADR-016). 성과·프로젝트·내 정보를 코드로 조립해 인쇄용으로 보여준다.
// 로그인 화면 전용 — Showcase 와 달리 이메일 원문을 그대로 싣는다(제출용 문서).

type Search = Promise<Record<string, string | string[] | undefined>>;

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

function Doc({ doc }: { doc: PortfolioDoc }) {
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

export default async function ExportPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const starOnly = sp.star === "1";
  const photos = sp.photos !== "0";
  const href = (patch: { star?: boolean; photos?: boolean }) => {
    const q = new URLSearchParams();
    if (patch.star ?? starOnly) q.set("star", "1");
    if (!(patch.photos ?? photos)) q.set("photos", "0");
    const qs = q.toString();
    return qs ? `/career/export?${qs}` : "/career/export";
  };

  const configured = isStoreConfigured();
  let doc: PortfolioDoc | null = null;
  let failed = false;
  if (configured) {
    try {
      const [aStore, pStore, prStore] = await Promise.all([
        getAchievementStore(),
        getProjectStore(),
        getProfileStore(),
      ]);
      const [achievements, projects, profile] = await Promise.all([
        aStore ? aStore.list() : Promise.resolve([] as Achievement[]),
        pStore ? pStore.list() : Promise.resolve([] as Project[]),
        prStore ? prStore.get() : Promise.resolve(DEFAULT_PROFILE),
      ]);
      doc = buildPortfolio(achievements, projects, profile, currentYearMonth(todayKst()), { starOnly, photos });
    } catch {
      failed = true;
    }
  }

  return (
    <main className={`${cstyles.shell} ${styles.wide}`}>
      <div className={styles.noPrint}>
        <div className={cstyles.crumb}>커리어</div>
        <h1 className={cstyles.title}>내보내기</h1>
        <p className={cstyles.lede}>
          성과·프로젝트·내 정보를 묶어 제출용 문서로 만듭니다. AI 없이 저장된 내용 그대로 조립합니다.
          &ldquo;인쇄 · PDF 저장&rdquo;에서 대상을 PDF로 고르면 파일로 받을 수 있습니다.
        </p>
        <CareerSubnav />

        <div className={styles.toolbar}>
          <div className={styles.kind}>
            <span className={styles.kindOn}>포트폴리오</span>
            <span className={styles.kindOff} title="양식을 받으면 추가됩니다">
              경력기술서 · 준비 중
            </span>
          </div>
          <div className={styles.opts}>
            <span className={styles.seg}>
              <Link href={href({ star: false })} aria-current={!starOnly ? "true" : undefined}>
                전체 성과
              </Link>
              <Link href={href({ star: true })} aria-current={starOnly ? "true" : undefined}>
                ⭐만
              </Link>
            </span>
            <span className={styles.seg}>
              <Link href={href({ photos: true })} aria-current={photos ? "true" : undefined}>
                사진 포함
              </Link>
              <Link href={href({ photos: false })} aria-current={!photos ? "true" : undefined}>
                사진 빼기
              </Link>
            </span>
            {doc ? (
              <span className={styles.count}>
                프로젝트 {doc.counts.projects} · 성과 {doc.counts.achievements}
              </span>
            ) : null}
            <PrintButton />
          </div>
        </div>
        {!configured ? (
          <p className={cstyles.banner}>원격 저장소가 설정되지 않았습니다.</p>
        ) : failed ? (
          <p className={cstyles.banner}>원격 저장소에 연결하지 못했습니다. 잠시 후 다시 시도하세요.</p>
        ) : null}
      </div>

      {doc ? <Doc doc={doc} /> : null}
    </main>
  );
}
