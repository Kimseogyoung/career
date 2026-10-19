import Link from "next/link";
import { notFound } from "next/navigation";
import { getAchievementStore, getResumeStore, isStoreConfigured } from "@/lib/store/instance";
import type { ResumeFile } from "@/lib/store/resumes";
import { PortfolioPaper, resumeSummary, savedAtText } from "../../doc";
import { PrintButton } from "../../print-button";
import { DeleteVersion } from "./delete-version";
import cstyles from "../../../career.module.css";
import styles from "../../export.module.css";

export const dynamic = "force-dynamic";

// 저장본 보기(3-2). 저장 당시 그대로 그린다. 원본 성과가 그 뒤 바뀌었으면 몇 건인지만 알려 준다
// — 다시 저장할지 판단용이며 저장본 자체는 고치지 않는다.

export default async function SavedResumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isStoreConfigured()) notFound();

  let resume: ResumeFile | null = null;
  let failed = false;
  try {
    resume = (await (await getResumeStore())?.get(id)) ?? null;
  } catch {
    failed = true;
  }
  if (!resume && !failed) notFound();

  // 원본과의 차이(실패하면 생략).
  let drift: { edited: number; deleted: number } | null = null;
  if (resume) {
    try {
      const current = (await (await getAchievementStore())?.list()) ?? [];
      const byId = new Map(current.map((a) => [a.id, a]));
      const savedAt = Date.parse(resume.meta.createdAt);
      let edited = 0;
      let deleted = 0;
      for (const sid of resume.sourceIds) {
        const a = byId.get(sid);
        if (!a) deleted++;
        // 시각 표기(Z / +09:00)가 섞일 수 있어 문자열이 아니라 시각으로 비교한다.
        else if (Date.parse(a.updatedAt) > savedAt) edited++;
      }
      drift = { edited, deleted };
    } catch {
      drift = null;
    }
  }

  return (
    <main className={`${cstyles.shell} ${styles.wide}`}>
      <div className={styles.noPrint}>
        <div className={cstyles.crumb}>
          <Link href="/career/export" className={styles.crumbLink}>
            내보내기
          </Link>{" "}
          · 저장본
        </div>
        <h1 className={cstyles.title}>{resume?.meta.name ?? "저장본"}</h1>
        {resume ? (
          <p className={cstyles.lede}>
            {savedAtText(resume.meta.createdAt)}에 저장한 {resume.meta.kind === "portfolio" ? "포트폴리오" : "문서"}
            입니다 ({resumeSummary(resume.meta)}). 원본을 고쳐도 이 문서는 바뀌지 않습니다.
          </p>
        ) : null}

        {failed ? (
          <p className={cstyles.banner}>원격 저장소에 연결하지 못했습니다. 잠시 후 다시 시도하세요.</p>
        ) : null}

        {resume ? (
          <div className={styles.toolbar}>
            <div className={styles.kind}>
              <Link href="/career/export" className={styles.ghostBtn}>
                ← 지금 내용으로
              </Link>
            </div>
            <div className={styles.opts}>
              <DeleteVersion id={resume.meta.id} />
              <PrintButton />
            </div>
          </div>
        ) : null}

        {drift && (drift.edited || drift.deleted) ? (
          <p className={styles.drift}>
            저장한 뒤로 원본 성과{" "}
            {[drift.edited ? `${drift.edited}건이 수정` : null, drift.deleted ? `${drift.deleted}건이 삭제` : null]
              .filter(Boolean)
              .join(", ")}
            됐습니다. 최신 내용이 필요하면 내보내기에서 다시 저장하세요.
          </p>
        ) : null}
      </div>

      {resume ? <PortfolioPaper doc={resume.doc} /> : null}
    </main>
  );
}
