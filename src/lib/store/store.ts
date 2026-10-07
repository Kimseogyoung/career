import "server-only";
import { AuthError, ConflictError, GitHubStore, TransientError, type RemoteFile } from "./github";
import { LruCache } from "./cache";
import { WriteQueue } from "./queue";
import { applyOpsToMonth, emptyIndex, parseIndex, parseMonth, reindexMonth } from "./model";
import { INDEX_PATH, monthFilePath, monthOf, monthlySummaryPath, weeklySummaryPath } from "./paths";
import type { DayRecord, Entry, IndexFile, MonthFile, QueueOp, Summary } from "./types";

// 원격 저장 계층의 오케스트레이터.
//
// 읽기: 메모리 캐시 → (miss) 원격 → 캐시 적재
// 쓰기: 메모리 즉시 반영 → 큐 적재 → 디바운스 플러시 → sha 커밋
//
// 불변식: 큐가 비어 있다 == 모든 변경이 원격에 반영되었다. (ADR-006)
// 이 불변식을 지키려고 플러시는 "원격 쓰기 성공" 뒤에만 큐에서 제거한다.

export interface StoreOptions {
  cacheMonths: number;
  flushDebounceMs: number;
  now?: () => Date;
  setTimer?: (fn: () => void, ms: number) => { cancel: () => void };
}

interface CachedMonth {
  data: MonthFile; // 원격 기준 + 미반영 변경분이 적용된 현재 상태
  sha: string | null; // 이 상태의 기반이 된 원격 버전 sha (신규면 null)
}

const BACKOFF_MS = [30_000, 120_000, 600_000, 3_600_000];
const MAX_CONFLICT_RETRY = 3;

// 주/월 요약 파일({week|month, ...Summary})을 Summary 로 파싱.
function parseSummaryFile(text: string | null): Summary | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Partial<Summary>;
    if (typeof parsed.text === "string") {
      return {
        text: parsed.text,
        generatedBy: parsed.generatedBy ?? "manual",
        model: parsed.model ?? null,
        generatedAt: parsed.generatedAt ?? null,
        editedAt: parsed.editedAt ?? null,
        status: parsed.status ?? "ok",
      };
    }
  } catch {
    /* 깨진 파일은 없는 것으로 */
  }
  return null;
}

function summaryHead(summary: Summary): string {
  const first = summary.text.trim().split("\n")[0] ?? "";
  return first.length > 80 ? first.slice(0, 80) : first;
}

export class Store {
  private readonly months: LruCache<CachedMonth>;
  private index: { data: IndexFile; sha: string | null } | null = null;
  private pending: QueueOp[] = [];

  private flushTimer: { cancel: () => void } | null = null;
  private flushing = false;
  private flushAgain = false;
  private backoffStep = 0;

  // UI 가 읽는 동기화 상태.
  public lastFlushAt: string | null = null;
  public degraded = false;
  public lastError: string | null = null;

  private readonly now: () => Date;
  private readonly setTimer: (fn: () => void, ms: number) => { cancel: () => void };

  constructor(
    private readonly github: GitHubStore,
    private readonly queue: WriteQueue,
    private readonly opts: StoreOptions,
  ) {
    this.months = new LruCache<CachedMonth>(opts.cacheMonths);
    this.now = opts.now ?? (() => new Date());
    this.setTimer =
      opts.setTimer ??
      ((fn, ms) => {
        const t = setTimeout(fn, ms);
        return { cancel: () => clearTimeout(t) };
      });
  }

  /** 기동 시 1회. 디스크에 남은 미동기화분을 복원하고 즉시 플러시를 시도한다. */
  async init(): Promise<void> {
    this.pending = await this.queue.load();
    if (this.pending.length > 0) this.scheduleFlush(0);
  }

  // ── 읽기 ──────────────────────────────────────────────────────────

  async getIndex(): Promise<IndexFile> {
    if (this.index) return this.index.data;
    const file = await this.safeRead(INDEX_PATH);
    this.index = { data: parseIndex(file?.text ?? null), sha: file?.sha ?? null };
    return this.index.data;
  }

  async getMonth(month: string): Promise<MonthFile> {
    const cached = this.months.get(month);
    if (cached) return cached.data;

    const file = await this.safeRead(monthFilePath(month));
    let data = parseMonth(file?.text ?? null, month);
    // 이 월에 대해 아직 반영 안 된 변경분이 있으면 얹어서 보여준다
    // (사용자는 자기 쓰기를 즉시 본다 — 낙관적 UI).
    const ownOps = this.pending.filter((op) => this.opMonth(op) === month);
    if (ownOps.length > 0) data = applyOpsToMonth(data, ownOps);

    this.months.set(month, { data, sha: file?.sha ?? null });
    return data;
  }

  /** 하루치 기록. 기록 없는 날은 빈 엔트리 배열을 돌려준다. */
  async getDay(date: string): Promise<DayRecord> {
    const month = await this.getMonth(monthOf(date));
    return month.days[date] ?? { entries: [] };
  }

  // 원격 읽기 래퍼. 성공하면 저하 해제, 실패는 저하 표시 후 그대로 던진다.
  private async safeRead(path: string): Promise<RemoteFile | null> {
    try {
      const file = await this.github.read(path);
      this.clearDegraded();
      return file;
    } catch (e) {
      if (e instanceof AuthError || e instanceof TransientError) {
        this.markDegraded(e.message);
      }
      throw e;
    }
  }

  // ── 쓰기 ──────────────────────────────────────────────────────────

  async upsertEntry(date: string, entry: Entry): Promise<void> {
    await this.enqueue({ op: "upsertEntry", date, entry, at: this.iso(), seq: 0 });
  }

  async deleteEntry(date: string, entryId: string): Promise<void> {
    await this.enqueue({ op: "deleteEntry", date, entryId, at: this.iso(), seq: 0 });
  }

  async putDaySummary(date: string, summary: Summary): Promise<void> {
    await this.enqueue({
      op: "putSummary",
      scope: "day",
      key: date,
      summary,
      at: this.iso(),
      seq: 0,
    });
  }

  // ── 주/월 요약 (별도 파일) ────────────────────────────────────────
  // 일 요약은 월 파일에 내장돼 큐로 반영되지만, 주/월 요약은 독립 파일이다.
  // 변경이 드물고 유실돼도 재생성 가능하므로 큐를 거치지 않고 원격에 직접 쓴다(sha 재시도).

  async getWeekSummary(isoWeek: string): Promise<Summary | null> {
    const file = await this.safeRead(weeklySummaryPath(isoWeek));
    return parseSummaryFile(file?.text ?? null);
  }

  async getMonthSummary(ym: string): Promise<Summary | null> {
    const file = await this.safeRead(monthlySummaryPath(ym));
    return parseSummaryFile(file?.text ?? null);
  }

  async putWeekSummary(isoWeek: string, summary: Summary): Promise<void> {
    await this.mutateRemote(
      weeklySummaryPath(isoWeek),
      () => JSON.stringify({ week: isoWeek, ...summary }, null, 2),
      `summary: 주간 ${isoWeek}`,
    );
    await this.patchIndex((idx) => {
      idx.weeks = { ...idx.weeks, [isoWeek]: { head: summaryHead(summary), hasSummary: true } };
    });
  }

  async putMonthSummary(ym: string, summary: Summary): Promise<void> {
    await this.mutateRemote(
      monthlySummaryPath(ym),
      () => JSON.stringify({ month: ym, ...summary }, null, 2),
      `summary: 월간 ${ym}`,
    );
    await this.patchIndex((idx) => {
      const prev = idx.months[ym] ?? { hasSummary: false, totalHours: 0 };
      idx.months = { ...idx.months, [ym]: { ...prev, hasSummary: true } };
    });
  }

  // 원격 파일 1개를 읽어 새 내용으로 쓴다(신규면 sha 없이). 409 충돌 시 재시도.
  private async mutateRemote(
    path: string,
    build: (current: string | null) => string,
    message: string,
  ): Promise<void> {
    for (let attempt = 0; attempt <= MAX_CONFLICT_RETRY; attempt++) {
      const remote = await this.github.read(path);
      const next = build(remote?.text ?? null);
      try {
        await this.github.write(path, next, remote?.sha, message);
        this.clearDegraded();
        return;
      } catch (e) {
        if (e instanceof ConflictError && attempt < MAX_CONFLICT_RETRY) continue;
        if (e instanceof AuthError || e instanceof TransientError) this.markDegraded(e.message);
        throw e;
      }
    }
  }

  // 인덱스를 읽어 mutator 로 수정 후 쓴다. 메모리 캐시(this.index)도 최신으로 맞춘다.
  private async patchIndex(mutate: (idx: IndexFile) => void): Promise<void> {
    for (let attempt = 0; attempt <= MAX_CONFLICT_RETRY; attempt++) {
      const remote = await this.github.read(INDEX_PATH);
      const idx = parseIndex(remote?.text ?? null);
      idx.updatedAt = this.iso();
      mutate(idx);
      try {
        const sha = await this.github.write(
          INDEX_PATH,
          JSON.stringify(idx, null, 2),
          remote?.sha,
          "index: 요약 반영",
        );
        this.index = { data: idx, sha };
        return;
      } catch (e) {
        if (e instanceof ConflictError && attempt < MAX_CONFLICT_RETRY) continue;
        throw e;
      }
    }
  }

  private async enqueue(op: QueueOp): Promise<void> {
    op.seq = this.queue.nextSeq();
    const month = this.opMonth(op);

    // 1) 메모리 즉시 반영
    await this.getMonth(month); // 캐시에 올림
    const cached = this.months.get(month);
    if (cached) cached.data = applyOpsToMonth(cached.data, [op]);
    const index = await this.getIndex();
    this.index = {
      data: reindexMonth(index, cached?.data ?? parseMonth(null, month), this.iso()),
      sha: this.index?.sha ?? null,
    };

    // 2) 큐에 적재(내구성)
    this.pending.push(op);
    await this.queue.append(op);

    // 3) 디바운스 플러시 예약
    this.scheduleFlush(this.opts.flushDebounceMs);
  }

  // ── 플러시 ────────────────────────────────────────────────────────

  private scheduleFlush(ms: number): void {
    this.flushTimer?.cancel();
    this.flushTimer = this.setTimer(() => {
      void this.flush();
    }, ms);
  }

  /** 수동/테스트 트리거. 지금 즉시 플러시한다. */
  async flush(): Promise<void> {
    if (this.flushing) {
      this.flushAgain = true; // 끝난 뒤 한 번 더
      return;
    }
    this.flushing = true;
    try {
      do {
        this.flushAgain = false;
        await this.flushOnce();
      } while (this.flushAgain && this.pending.length > 0 && !this.degraded);
    } finally {
      this.flushing = false;
    }
  }

  private async flushOnce(): Promise<void> {
    const batch = [...this.pending];
    if (batch.length === 0) return;

    const byMonth = new Map<string, QueueOp[]>();
    for (const op of batch) {
      const m = this.opMonth(op);
      const list = byMonth.get(m);
      if (list) list.push(op);
      else byMonth.set(m, [op]);
    }

    try {
      // 1) 각 월 파일 반영(충돌 시 재읽기 후 재적용)
      for (const [month, ops] of byMonth) {
        await this.flushMonth(month, ops);
      }
      // 2) 인덱스 반영
      await this.flushIndex([...byMonth.keys()]);

      // 3) 성공 — 반영한 건만 큐에서 제거(플러시 도중 들어온 건 보존)
      const flushedSeqs = new Set(batch.map((op) => op.seq));
      this.pending = this.pending.filter((op) => !flushedSeqs.has(op.seq));
      await this.queue.rewrite(this.pending);

      this.lastFlushAt = this.iso();
      this.backoffStep = 0;
      this.clearDegraded();
    } catch (e) {
      // 실패 — 큐는 그대로. 백오프 후 재시도. 데이터는 유실되지 않는다.
      this.markDegraded((e as Error).message);
      if (!(e instanceof AuthError)) {
        const delay = BACKOFF_MS[Math.min(this.backoffStep, BACKOFF_MS.length - 1)];
        this.backoffStep += 1;
        if (delay !== undefined) this.scheduleFlush(delay);
      }
      // AuthError 는 재시도 무의미 — 토큰 교체 후 수동 플러시를 기다린다.
    }
  }

  private async flushMonth(month: string, ops: QueueOp[]): Promise<void> {
    const path = monthFilePath(month);
    for (let attempt = 0; attempt <= MAX_CONFLICT_RETRY; attempt++) {
      const remote = await this.github.read(path);
      const base = parseMonth(remote?.text ?? null, month);
      const next = applyOpsToMonth(base, ops);
      try {
        const newSha = await this.github.write(
          path,
          JSON.stringify(next, null, 2),
          remote?.sha,
          `journal: ${month} 업데이트 (${ops.length}건)`,
        );
        // 캐시를 원격 확정 상태로 맞추되, 그사이 들어온 미반영 건은 다시 얹는다.
        const laterOps = this.pending.filter(
          (op) => this.opMonth(op) === month && !ops.includes(op),
        );
        this.months.set(month, {
          data: laterOps.length ? applyOpsToMonth(next, laterOps) : next,
          sha: newSha,
        });
        return;
      } catch (e) {
        if (e instanceof ConflictError && attempt < MAX_CONFLICT_RETRY) continue;
        throw e;
      }
    }
  }

  private async flushIndex(affectedMonths: string[]): Promise<void> {
    for (let attempt = 0; attempt <= MAX_CONFLICT_RETRY; attempt++) {
      const remote = await this.github.read(INDEX_PATH);
      let next = parseIndex(remote?.text ?? null);
      for (const month of affectedMonths) {
        const cached = this.months.get(month);
        const data = cached?.data ?? parseMonth(null, month);
        next = reindexMonth(next, data, this.iso());
      }
      try {
        const newSha = await this.github.write(
          INDEX_PATH,
          JSON.stringify(next, null, 2),
          remote?.sha,
          `index: ${affectedMonths.join(", ")} 갱신`,
        );
        this.index = { data: next, sha: newSha };
        return;
      } catch (e) {
        if (e instanceof ConflictError && attempt < MAX_CONFLICT_RETRY) continue;
        throw e;
      }
    }
  }

  // ── 복구 (1-6) ────────────────────────────────────────────────────

  /** 데이터 레포의 최근 커밋 목록. */
  async listCommits(limit = 50) {
    return this.github.listCommits(limit);
  }

  /**
   * 과거 커밋 시점으로 복원한다. 미동기화 쓰기가 남아 있으면 먼저 반영을 시도하고,
   * 그래도 남아 있으면(저하) 거부한다 — 복원이 미반영 편집을 삼키지 않도록.
   * 복원 후 메모리 캐시를 비워 다음 읽기가 원격에서 새로 받게 한다.
   */
  async restoreTo(targetSha: string): Promise<void> {
    if (this.pending.length > 0) {
      await this.flush();
      if (this.pending.length > 0) {
        throw new Error("미동기화 기록이 남아 있어 복원할 수 없습니다. 동기화 후 다시 시도하세요.");
      }
    }
    await this.github.restoreToCommit(targetSha);
    // 캐시 무효화 — 복원된 원격 상태를 다시 읽는다.
    this.months.clear();
    this.index = null;
  }

  /** 전체 데이터를 하나의 JSON 으로 모은다(내보내기/로컬 2차 사본용). */
  async exportAll(): Promise<{
    exportedAt: string;
    index: IndexFile;
    months: Record<string, MonthFile>;
    weeklySummaries: Record<string, unknown>;
    monthlySummaries: Record<string, unknown>;
  }> {
    const index = await this.getIndex();
    const months: Record<string, MonthFile> = {};
    for (const month of Object.keys(index.months)) {
      months[month] = await this.getMonth(month);
    }
    const weeklySummaries: Record<string, unknown> = {};
    for (const wk of Object.keys(index.weeks)) {
      const s = await this.getWeekSummary(wk);
      if (s) weeklySummaries[wk] = s;
    }
    const monthlySummaries: Record<string, unknown> = {};
    for (const ym of Object.keys(index.months)) {
      const s = await this.getMonthSummary(ym);
      if (s) monthlySummaries[ym] = s;
    }
    return {
      exportedAt: this.iso(),
      index,
      months,
      weeklySummaries,
      monthlySummaries,
    };
  }

  // ── 상태 ──────────────────────────────────────────────────────────

  syncStatus() {
    return {
      pendingWrites: this.pending.length,
      lastFlushAt: this.lastFlushAt,
      degraded: this.degraded,
      lastError: this.lastError,
    };
  }

  private markDegraded(message: string): void {
    this.degraded = true;
    this.lastError = message;
  }

  private clearDegraded(): void {
    this.degraded = false;
    this.lastError = null;
  }

  private opMonth(op: QueueOp): string {
    if (op.op === "putSummary") return monthOf(op.key);
    return monthOf(op.date);
  }

  private iso(): string {
    return this.now().toISOString();
  }
}

export { emptyIndex };
