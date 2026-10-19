import { postingUrl, parseDeadline } from "@/lib/positions/gamejob";
import { buildMe, scorePosting } from "@/lib/positions/score";
import { isCollecting } from "@/lib/positions/service";
import { currentYearMonth } from "@/lib/period";
import {
  getAchievementStore,
  getPositionStore,
  getProfileStore,
  isStoreConfigured,
} from "@/lib/store/instance";
import { DEFAULT_PROFILE } from "@/lib/store/profile";
import type { Achievement, Position } from "@/lib/store/types";
import { todayKst } from "@/lib/time";
import { CareerSubnav } from "../career-subnav";
import { PositionsBoard } from "./positions-board";
import type { BoardData, PositionRow } from "./types";
import cstyles from "../career.module.css";

export const dynamic = "force-dynamic";

// 추천 포지션(ADR-017). 게임잡에서 고른 직무의 공고를 모아 내 기술·성과와 맞춰 본다(탭을 열 때 오래됐으면 수집).
// 점수는 서버에서 계산해 넘긴다(규칙 기반, AI 없음).

const NEW_MS = 3 * 24 * 3600_000;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** 저장된 공고 + 내 정보·성과 → 점수 매긴 행. */
async function loadBoard(): Promise<BoardData> {
  const [ps, prs, as] = await Promise.all([
    getPositionStore(),
    getProfileStore(),
    getAchievementStore(),
  ]);
  const [file, profile, achievements] = await Promise.all([
    ps!.get(),
    prs ? prs.get() : Promise.resolve(DEFAULT_PROFILE),
    as ? as.list() : Promise.resolve([] as Achievement[]),
  ]);
  const today = todayKst();
  const me = buildMe(profile, achievements, currentYearMonth(today));
  const now = Date.now();
  const rows: PositionRow[] = file.postings.map((p: Position) => {
    const s = scorePosting(p, me);
    const dl = parseDeadline(p.deadline, today);
    return {
      gno: p.gno,
      url: postingUrl(p.gno),
      company: p.company,
      title: p.title,
      career: p.career.replace(/^경력\s*/, "") || "-",
      careerVerdict: s.career,
      meta: [p.local?.replace(/\s*>\s*/, " "), p.genre, p.employ].filter(Boolean).join(" · "),
      deadline:
        dl.kind === "date"
          ? { label: "", date: dl.date, days: daysBetween(today, dl.date) }
          : { label: dl.label },
      registered: p.registered,
      isNew: !p.baseline && now - Date.parse(p.firstSeen) < NEW_MS,
      mark: file.marks[String(p.gno)],
      score: s.score,
      uncertain: s.uncertain,
      matched: s.matched.map((m) => ({
        name: m.name,
        req: m.section === "req",
        evidence: m.evidence,
      })),
      missing: s.missing.map((m) => ({ name: m.name, req: m.section === "req" })),
      evidence: s.evidence,
      summary: p.detail?.summary ?? [],
    };
  });
  return { duties: file.duties, rows, lastRun: file.lastRun ?? null, running: isCollecting() };
}

export default async function PositionsPage() {
  const configured = isStoreConfigured();
  let data: BoardData | null = null;
  let failed = false;
  if (configured) {
    try {
      data = await loadBoard();
    } catch {
      failed = true;
    }
  }

  return (
    <main className={cstyles.shell} style={{ maxWidth: 900 }}>
      <div className={cstyles.crumb}>커리어</div>
      <h1 className={cstyles.title}>추천 포지션</h1>
      <p className={cstyles.lede}>
        게임잡에서 고른 직무의 공고를 모아 내 기술·성과와 맞춰 봅니다. 이 탭을 열 때 마지막 수집이 12시간 넘었으면 새로 받아 옵니다. 적합도는
        기술 일치 60 · 경력 조건 25 · 성과로 증명된 정도 15 로 매깁니다. 공고 원문은 게임잡에서
        엽니다.
      </p>
      <CareerSubnav />
      {!configured ? (
        <p className={cstyles.banner}>원격 저장소가 설정되지 않았습니다.</p>
      ) : failed || !data ? (
        <p className={cstyles.banner}>
          원격 저장소에 연결하지 못했습니다. 잠시 후 다시 시도하세요.
        </p>
      ) : (
        <PositionsBoard data={data} />
      )}
    </main>
  );
}
