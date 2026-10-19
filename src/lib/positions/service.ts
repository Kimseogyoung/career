import "server-only";
import { getAchievementStore, getPositionStore, getProfileStore } from "@/lib/store/instance";
import { collectGamejob } from "./collector";

// 수집 실행. 정기 수집은 없다 — 추천 포지션 탭을 열 때 오래됐으면 돌고, 그 밖엔 "지금 수집"으로만(ADR-017).
// 탭을 안 여는 날은 게임잡에 요청이 가지 않는다. 동시에 하나만 돈다.
// 실패해도 예외를 밖으로 던지지 않는다 — 게임잡이 죽어도 앱·기록 기능은 영향이 없어야 한다(제약 6).

/** "지금 수집" 최소 간격 — 버튼 연타로 게임잡을 두드리지 않게. */
export const MANUAL_COOLDOWN_MS = 10 * 60_000;
/** 탭을 열 때 자동 수집: 마지막 수집이 이보다 오래됐으면 돈다. */
export const STALE_MS = 12 * 3600_000;
/** 마지막 수집이 실패했으면(차단 등) 이만큼은 자동으로 다시 두드리지 않는다. */
const FAILED_RETRY_MS = 3600_000;

interface CollectState {
  running: Promise<void> | null;
}
const g = globalThis as typeof globalThis & { __careerCollect?: CollectState };
const state: CollectState = (g.__careerCollect ??= { running: null });

export function isCollecting(): boolean {
  return state.running !== null;
}

async function runOnce(): Promise<void> {
  const store = await getPositionStore();
  if (!store) return;
  const cur = await store.get();
  if (!cur.duties.length) return;

  // 내 기술: 사전에 없던 이름도 공고에서 찾도록(실패해도 기본 사전으로 진행).
  let myTechs: string[] = [];
  try {
    const [prof, ach] = await Promise.all([getProfileStore(), getAchievementStore()]);
    const [p, a] = await Promise.all([prof?.get(), ach?.list()]);
    myTechs = [...(p?.techStack.flatMap((x) => x.items) ?? []), ...(a ?? []).flatMap((x) => x.tech)];
  } catch {
    /* 기본 사전만 */
  }

  const known = new Set(cur.postings.filter((p) => p.detail).map((p) => p.gno));
  const result = await collectGamejob(cur.duties, { known, myTechs });
  await store.applyRun(result);
  console.log(
    `[positions] 수집 ${result.run.ok ? "완료" : `중단(${result.run.error})`} 목록 ${result.run.listed} · 상세 ${result.run.fetched}`,
  );
}

/** 수집을 시작한다(이미 돌고 있으면 그걸 기다린다). */
export function startCollect(): Promise<void> {
  if (!state.running) {
    state.running = runOnce()
      .catch((e) => console.error("[positions] 수집 실패:", (e as Error).message))
      .finally(() => {
        state.running = null;
      });
  }
  return state.running;
}

/** "지금 수집" 가능 여부. 돌고 있거나 최근에 돌았으면 남은 시간(ms). */
export async function manualWaitMs(): Promise<number> {
  if (state.running) return MANUAL_COOLDOWN_MS;
  const store = await getPositionStore();
  const at = (await store?.get())?.lastRun?.at;
  if (!at) return 0;
  return Math.max(0, Date.parse(at) + MANUAL_COOLDOWN_MS - Date.now());
}

/** 탭을 열 때: 수집이 오래됐으면 시작한다(기다리지 않음). 시작했으면 true. POSITIONS_COLLECT=off 면 안 한다. */
export async function collectIfStale(): Promise<boolean> {
  if (process.env.POSITIONS_COLLECT === "off") return false;
  if (state.running) return true;
  const store = await getPositionStore();
  const last = (await store?.get())?.lastRun;
  if (last) {
    const age = Date.now() - Date.parse(last.at);
    if (age < (last.ok ? STALE_MS : FAILED_RETRY_MS)) return false;
  }
  void startCollect();
  return true;
}
