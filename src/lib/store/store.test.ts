import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm as rmRaw } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Windows 에서 방금 닫은 파일의 핸들 해제가 늦어 rmdir 가 ENOTEMPTY 로 실패할 수 있다. 재시도.
const rm = (dir: string) =>
  rmRaw(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
import { GitHubStore } from "./github";
import { WriteQueue } from "./queue";
import { Store } from "./store";
import { FakeGitHub } from "./fake-github";
import { monthFilePath, INDEX_PATH } from "./paths";
import type { Entry } from "./types";

// 저장 계층의 핵심은 정상 경로가 아니라 장애 경로다. 원격이 죽거나 충돌해도
// 데이터가 유실되지 않음(큐에 남아 재시도됨)을 검증한다. (ADR-006)

function entry(id: string, content = "작업"): Entry {
  return {
    id,
    start: "09:00",
    end: "10:00",
    category: "work",
    tags: [],
    content,
    createdAt: "2026-10-01T09:00:00+09:00",
    updatedAt: "2026-10-01T09:00:00+09:00",
  };
}

// 타이머를 수동 제어한다. 디바운스를 테스트에서 즉시 발화시키기 위함.
function manualTimer() {
  const pending: Array<() => void> = [];
  const setTimer = (fn: () => void) => {
    pending.push(fn);
    return {
      cancel: () => {
        const i = pending.indexOf(fn);
        if (i >= 0) pending.splice(i, 1);
      },
    };
  };
  const fireAll = () => {
    const snapshot = [...pending];
    pending.length = 0;
    for (const fn of snapshot) fn();
  };
  return { setTimer, fireAll };
}

async function makeStore(fake: FakeGitHub, timer: ReturnType<typeof manualTimer>) {
  const dir = await mkdtemp(join(tmpdir(), "store-test-"));
  const github = new GitHubStore({ token: "t", repo: "o/r", branch: "main" }, fake.fetch);
  const queue = new WriteQueue(dir);
  const store = new Store(github, queue, {
    cacheMonths: 24,
    flushDebounceMs: 10_000,
    setTimer: timer.setTimer,
  });
  await store.init();
  return { store, queue, dir };
}

test("정상: 쓰기 → 플러시 → 원격에 반영되고 큐가 빈다", async () => {
  const fake = new FakeGitHub();
  const timer = manualTimer();
  const { store, dir } = await makeStore(fake, timer);
  try {
    await store.upsertEntry("2026-10-01", entry("01"));
    assert.equal(store.syncStatus().pendingWrites, 1, "쓰기 직후 큐에 1건");

    // 디바운스 타이머를 기다리는 대신 직접 플러시(테스트 결정성).
    await store.flush();

    assert.equal(store.syncStatus().pendingWrites, 0, "플러시 후 큐 빔");
    const remote = fake.get(monthFilePath("2026-10"));
    assert.ok(remote && remote.includes('"id": "01"'), "원격 월 파일에 엔트리 존재");
    assert.ok(fake.get(INDEX_PATH)?.includes("2026-10-01"), "인덱스에 날짜 반영");
  } finally {
    await rm(dir);
  }
});

test("일시 오류(503): 플러시 실패해도 큐에 남고 데이터 보존, 재시도 시 반영", async () => {
  const fake = new FakeGitHub();
  const timer = manualTimer();
  const { store, dir } = await makeStore(fake, timer);
  try {
    await store.upsertEntry("2026-10-01", entry("01"));
    fake.injectFailures("transient"); // 첫 읽기부터 503
    await store.flush();

    assert.equal(store.syncStatus().pendingWrites, 1, "실패 후에도 큐에 그대로");
    assert.equal(store.degraded, true, "저하 상태 표시");
    assert.equal(fake.get(monthFilePath("2026-10")), null, "원격엔 아직 없음");

    // 복구 후 재시도
    await store.flush();
    assert.equal(store.syncStatus().pendingWrites, 0, "재시도로 반영됨");
    assert.equal(store.degraded, false, "저하 해제");
  } finally {
    await rm(dir);
  }
});

test("인증 오류(401): 큐 보존, 백오프 재예약 없이 수동 대기", async () => {
  const fake = new FakeGitHub();
  const timer = manualTimer();
  const { store, dir } = await makeStore(fake, timer);
  try {
    await store.upsertEntry("2026-10-01", entry("01"));
    fake.injectFailures("auth");
    await store.flush();

    assert.equal(store.syncStatus().pendingWrites, 1, "인증 실패 후 큐 보존");
    assert.equal(store.degraded, true);

    // 토큰 교체 후 수동 플러시로 복구
    await store.flush();
    assert.equal(store.syncStatus().pendingWrites, 0);
  } finally {
    await rm(dir);
  }
});

test("충돌(409): 다른 곳에서 먼저 쓴 변경을 덮지 않고 병합해 재시도", async () => {
  const fake = new FakeGitHub();
  const timer = manualTimer();
  const { store, dir } = await makeStore(fake, timer);
  try {
    // 원격에 이미 다른 날짜 엔트리가 있는 월 파일이 존재한다고 가정.
    fake.seed(
      monthFilePath("2026-10"),
      JSON.stringify({
        month: "2026-10",
        version: 1,
        days: { "2026-10-02": { entries: [entry("99", "기존")] } },
      }),
    );
    await store.upsertEntry("2026-10-01", entry("01", "신규"));

    // 첫 write 에서 409 를 한 번 주입(읽기와 쓰기 사이 제3자가 수정한 상황).
    // 월 파일 플러시는 read(ok) → write(409) → read(ok) → write(ok) 로 복구해야 한다.
    fake.injectWriteConflicts(1);

    await store.flush();

    const remote = fake.get(monthFilePath("2026-10"));
    assert.ok(remote, "월 파일 존재");
    assert.ok(remote.includes('"id": "01"'), "내 신규 엔트리 반영");
    assert.ok(remote.includes("2026-10-02"), "제3자의 기존 날짜도 보존(덮어쓰지 않음)");
    assert.equal(store.syncStatus().pendingWrites, 0, "최종적으로 큐 빔");
  } finally {
    await rm(dir);
  }
});

test("재시작 복원: 큐 파일에 남은 미동기화분을 새 인스턴스가 이어받아 플러시", async () => {
  const fake = new FakeGitHub();
  const timer1 = manualTimer();
  const dir = await mkdtemp(join(tmpdir(), "store-restart-"));
  try {
    // 1) 첫 인스턴스가 쓰고, 원격 반영 전에 "죽는다"(플러시 안 함).
    {
      const github = new GitHubStore({ token: "t", repo: "o/r", branch: "main" }, fake.fetch);
      const queue = new WriteQueue(dir);
      const store = new Store(github, queue, {
        cacheMonths: 24,
        flushDebounceMs: 10_000,
        setTimer: timer1.setTimer,
      });
      await store.init();
      await store.upsertEntry("2026-10-01", entry("01"));
      assert.equal(store.syncStatus().pendingWrites, 1);
      // 플러시하지 않고 폐기 → 큐 파일엔 1건이 남아 있어야 함
      const raw = await readFile(join(dir, "pending.jsonl"), "utf8");
      assert.ok(raw.includes('"01"'), "큐 파일에 미동기화분 보존");
    }

    // 2) 새 인스턴스가 같은 큐 디렉토리로 뜬다 → init 이 복원 + 즉시 플러시 예약
    {
      const timer2 = manualTimer();
      const github = new GitHubStore({ token: "t", repo: "o/r", branch: "main" }, fake.fetch);
      const queue = new WriteQueue(dir);
      const store = new Store(github, queue, {
        cacheMonths: 24,
        flushDebounceMs: 10_000,
        setTimer: timer2.setTimer,
      });
      await store.init();
      assert.equal(store.syncStatus().pendingWrites, 1, "복원된 미동기화분 1건");
      await store.flush();
      assert.equal(store.syncStatus().pendingWrites, 0, "복원 후 플러시로 반영");
      assert.ok(fake.get(monthFilePath("2026-10"))?.includes('"01"'));
    }
  } finally {
    await rm(dir);
  }
});

test("낙관적 UI: 플러시 전에도 읽으면 자기 쓰기가 보인다", async () => {
  const fake = new FakeGitHub();
  const timer = manualTimer();
  const { store, dir } = await makeStore(fake, timer);
  try {
    await store.upsertEntry("2026-10-01", entry("01", "방금 씀"));
    const month = await store.getMonth("2026-10");
    assert.equal(month.days["2026-10-01"]?.entries[0]?.content, "방금 씀", "플러시 전 조회에 반영");
  } finally {
    await rm(dir);
  }
});
