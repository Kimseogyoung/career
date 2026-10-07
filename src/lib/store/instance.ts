import "server-only";
import { GitHubStore } from "./github";
import { WriteQueue } from "./queue";
import { Store } from "./store";
import { SettingsStore } from "./settings";

// Store·SettingsStore 싱글턴. 환경변수로 구성하며, 설정이 없으면 null 을 반환한다.
// 원격 설정이 없어도 앱은 떠야 하므로(제약 6) 호출 측에서 null 을 "미설정"으로 처리한다.

let instance: Store | null = null;
let settings: SettingsStore | null = null;
let initPromise: Promise<void> | null = null;
let configured = false;

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
  if (instance) {
    await initPromise;
    return instance;
  }
  if (configured) return null;

  const github = buildGithub();
  if (!github) {
    configured = true;
    return null;
  }
  const queue = new WriteQueue(process.env.QUEUE_DIR ?? "./queue");
  instance = new Store(github, queue, {
    cacheMonths: Number(process.env.STORE_CACHE_MONTHS ?? 24),
    flushDebounceMs: Number(process.env.STORE_FLUSH_DEBOUNCE_MS ?? 10_000),
  });
  settings = new SettingsStore(github);
  initPromise = instance.init();
  await initPromise;
  return instance;
}

/** 설정 저장소. Store 와 같은 github 구성을 공유한다. */
export async function getSettingsStore(): Promise<SettingsStore | null> {
  await getStore(); // settings 를 함께 구성
  return settings;
}

/** 설정 여부만 빠르게 확인(네트워크 없음). */
export function isStoreConfigured(): boolean {
  return Boolean(process.env.STORE_GITHUB_TOKEN && process.env.STORE_GITHUB_REPO);
}
