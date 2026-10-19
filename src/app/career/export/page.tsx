import Link from "next/link";
import { loadPortfolio } from "@/lib/export/load";
import type { PortfolioDoc } from "@/lib/export/portfolio";
import { getResumeStore, isStoreConfigured } from "@/lib/store/instance";
import type { ResumeMeta } from "@/lib/store/types";
import { todayKst } from "@/lib/time";
import { PortfolioPaper, savedAtText, scopeText } from "./doc";
import { PrintButton } from "./print-button";
import { SaveVersion } from "./save-version";
import { SavedTable } from "./saved-table";
import cstyles from "../career.module.css";
import styles from "./export.module.css";

export const dynamic = "force-dynamic";

// 포트폴리오 내보내기(ROADMAP 3-1, ADR-016). 성과·프로젝트·내 정보를 코드로 조립해 인쇄용으로 보여준다.
// 로그인 화면 전용 — Showcase 와 달리 이메일 원문을 그대로 싣는다(제출용 문서).
// 마음에 들면 저장본으로 얼려 둔다(3-2).

type Search = Promise<Record<string, string | string[] | undefined>>;

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
  let saved: ResumeMeta[] | null = null;
  let failed = false;
  if (configured) {
    const [docResult, savedResult] = await Promise.allSettled([
      loadPortfolio({ starOnly, photos }),
      getResumeStore().then((s) => (s ? s.list() : [])),
    ]);
    if (docResult.status === "fulfilled") doc = docResult.value;
    else failed = true;
    // 저장본 목록을 못 읽어도 지금 조립본은 보여준다.
    if (savedResult.status === "fulfilled") saved = savedResult.value;
  }
  const defaultName = `포트폴리오 ${todayKst().replace(/-/g, ".")}${starOnly ? " ⭐" : ""}`;

  return (
    <main className={`${cstyles.shell} ${styles.wide}`}>
      <div className={styles.noPrint}>
        <h1 className={cstyles.title}>내보내기</h1>
        <p className={cstyles.lede}>
          성과·프로젝트·내 정보를 묶어 제출용 문서로 만듭니다. AI 없이 저장된 내용 그대로 조립합니다.
          &ldquo;인쇄 · PDF 저장&rdquo;에서 대상을 PDF로 고르면 파일로 받을 수 있습니다.
        </p>

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
            {doc ? <SaveVersion starOnly={starOnly} photos={photos} defaultName={defaultName} /> : null}
            <PrintButton />
          </div>
        </div>
        {!configured ? (
          <p className={cstyles.banner}>원격 저장소가 설정되지 않았습니다.</p>
        ) : failed ? (
          <p className={cstyles.banner}>원격 저장소에 연결하지 못했습니다. 잠시 후 다시 시도하세요.</p>
        ) : null}

        {configured ? (
          <section className={styles.saved}>
            <h2 className={styles.savedHead}>
              저장본 <span className={styles.count}>{saved ? saved.length : "불러오지 못함"}</span>
            </h2>
            {saved?.length ? (
              <SavedTable
                rows={saved.map((m) => ({
                  id: m.id,
                  name: m.name,
                  // 올해 것은 연도를 뺀다(좁은 화면에서 이름 칸을 넓게).
                  savedAt: savedAtText(m.createdAt).replace(`${todayKst().slice(0, 4)}.`, ""),
                  scope: scopeText(m),
                  counts: `${m.counts.projects} · ${m.counts.achievements}`,
                }))}
              />
            ) : saved ? (
              <p className={styles.savedEmpty}>
                아직 저장본이 없습니다. 마음에 드는 결과가 나오면 &ldquo;이 상태로 저장&rdquo;으로 남겨 두세요 — 원본
                성과를 나중에 고쳐도 저장본은 그대로입니다.
              </p>
            ) : null}
          </section>
        ) : null}
      </div>

      {doc ? <PortfolioPaper doc={doc} /> : null}
    </main>
  );
}
