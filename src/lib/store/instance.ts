import "server-only";
import { GitHubStore } from "./github";
import { WriteQueue } from "./queue";
import { Store } from "./store";

// Store 싱글턴. 환경변수로 구성하며, 설정이 없으면 null 을 반환한다.
// 원격 설정이 없어도 앱은 떠야 하므로(제약 6) 호출 측에서 null 을 "미설정"으로 처리한다.

let instance: Store | null = null;
let initPromise: Promise<void> | null = null;
let configured = false;

function build(): Store | null {
  const token = process.env.STORE_GITHUB_TOKEN;
  const repo = process.env.STORE_GITHUB_REPO;
  const branch = process.env.STORE_GITHUB_BRANCH ?? "main";
  if (!token || !repo) return null;

  const github = new GitHubStore({ token, repo, branch });
  const queueDir = process.env.QUEUE_DIR ?? "./queue";
  const queue = new WriteQueue(queueDir);
  return new Store(github, queue, {
    cacheMonths: Number(process.env.STORE_CACHE_MONTHS ?? 24),
    flushDebounceMs: Number(process.env.STORE_FLUSH_DEBOUNCE_MS ?? 10_000),
  });
}

/** 설정돼 있으면 초기화된 Store 를, 아니면 null 을 돌려준다. init 은 1회만 수행한다. */
export async function getStore(): Promise<Store | null> {
  if (instance) {
    await initPromise;
    return instance;
  }
  if (configured) return null; // 이미 "미설정"으로 판정됨

  const built = build();
  if (!built) {
    configured = true;
    return null;
  }
  instance = built;
  initPromise = built.init();
  await initPromise;
  return instance;
}

/** 설정 여부만 빠르게 확인(네트워크 없음). */
export function isStoreConfigured(): boolean {
  return Boolean(process.env.STORE_GITHUB_TOKEN && process.env.STORE_GITHUB_REPO);
}
