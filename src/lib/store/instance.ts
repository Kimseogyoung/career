import "server-only";
import { GitHubStore } from "./github";
import { WriteQueue } from "./queue";
import { Store } from "./store";
import { SettingsStore } from "./settings";
import { AchievementStore } from "./achievements";

// Store·SettingsStore 싱글턴. 환경변수로 구성하며, 설정이 없으면 null 을 반환한다.
// 원격 설정이 없어도 앱은 떠야 하므로(제약 6) 호출 측에서 null 을 "미설정"으로 처리한다.
//
// 주의: 싱글턴을 모듈 스코프 `let` 에 두면 안 된다. Next.js App Router 는 각 라우트
// (페이지·route handler·instrumentation)를 별도 서버 번들로 묶고, 같은 모듈이라도 번들마다
// 복제되어 `let` 싱글턴이 여러 개 생긴다. 그러면 쓰기(route handler)와 읽기(서버 컴포넌트)가
// 서로 다른 Store·캐시를 갖게 되어, 쓰기가 원격에 반영돼도 읽기 쪽 인메모리 캐시는 영영
// 갱신되지 않는다("저장했는데 새로고침하면 사라져 보이는" 버그). 프로세스 전역(globalThis)에
// 하나만 두어 모든 번들이 같은 인스턴스를 공유하게 한다.

interface StoreGlobal {
  instance: Store | null;
  settings: SettingsStore | null;
  achievements: AchievementStore | null;
  initPromise: Promise<void> | null;
  configured: boolean;
}

const g = globalThis as typeof globalThis & { __careerStore?: StoreGlobal };
const state: StoreGlobal = (g.__careerStore ??= {
  instance: null,
  settings: null,
  achievements: null,
  initPromise: null,
  configured: false,
});

function buildGithub(): GitHubStore | null {
  const token = process.env.STORE_GITHUB_TOKEN;
  const repo = process.env.STORE_GITHUB_REPO;
  const branch = process.env.STORE_GITHUB_BRANCH ?? "main";
  if (!token || !repo) return null;
  // 데이터 커밋이 프로필 잔디에 찍히지 않도록 전용(계정 미등록) 신원으로 커밋한다.
  return new GitHubStore({
    token,
    repo,
    branch,
    commitName: process.env.STORE_COMMIT_NAME ?? "Career Log",
    commitEmail: process.env.STORE_COMMIT_EMAIL ?? "career-log@users.noreply.invalid",
  });
}

/** 설정돼 있으면 초기화된 Store 를, 아니면 null 을 돌려준다. init 은 1회만 수행한다. */
export async function getStore(): Promise<Store | null> {
  if (state.instance) {
    await state.initPromise;
    return state.instance;
  }
  if (state.configured) return null;

  const github = buildGithub();
  if (!github) {
    state.configured = true;
    return null;
  }
  const queue = new WriteQueue(process.env.QUEUE_DIR ?? "./queue");
  // 동기 구간에서 instance·initPromise 를 함께 세팅(다음 await 전까지 인터리브 없음) → 이중 생성 방지.
  state.instance = new Store(github, queue, {
    cacheMonths: Number(process.env.STORE_CACHE_MONTHS ?? 24),
    flushDebounceMs: Number(process.env.STORE_FLUSH_DEBOUNCE_MS ?? 10_000),
  });
  state.settings = new SettingsStore(github);
  state.achievements = new AchievementStore(github);
  state.initPromise = state.instance.init();
  await state.initPromise;
  return state.instance;
}

/** 설정 저장소. Store 와 같은 github 구성을 공유한다. */
export async function getSettingsStore(): Promise<SettingsStore | null> {
  await getStore(); // settings 를 함께 구성
  return state.settings;
}

/** 성과 모음 저장소. */
export async function getAchievementStore(): Promise<AchievementStore | null> {
  await getStore();
  return state.achievements;
}

/** 설정 여부만 빠르게 확인(네트워크 없음). */
export function isStoreConfigured(): boolean {
  return Boolean(process.env.STORE_GITHUB_TOKEN && process.env.STORE_GITHUB_REPO);
}
