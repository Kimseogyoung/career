import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { QueueOp } from "./types";

// 미동기화 쓰기 큐. 아직 원격에 반영 안 된 변경분만 담는다(과거 기록 보관 아님).
// 불변식: 큐가 비어 있다 == 모든 변경이 원격에 반영되었다. (ADR-006)
//
// append-only JSON Lines. 플러시 성공 시 통째로 비운다. 평상시 0바이트.

export class WriteQueue {
  private readonly file: string;
  private seq = 0;

  constructor(dir: string) {
    this.file = join(dir, "pending.jsonl");
  }

  /** 기동 시 1회. 디스크에 남은 미동기화분을 복원한다(재시작 전 쌓인 것). */
  async load(): Promise<QueueOp[]> {
    let raw: string;
    try {
      raw = await readFile(this.file, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
    const ops: QueueOp[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const op = JSON.parse(trimmed) as QueueOp;
        ops.push(op);
        if (op.seq > this.seq) this.seq = op.seq;
      } catch {
        // 반쯤 쓰다 만 줄(크래시 등)은 버린다. 마지막 한 줄에서만 생길 수 있다.
      }
    }
    return ops;
  }

  nextSeq(): number {
    return ++this.seq;
  }

  /** 변경분 1건을 큐 파일에 추가하고 fsync 까지 보장한다. */
  async append(op: QueueOp): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const { open } = await import("node:fs/promises");
    const handle = await open(this.file, "a");
    try {
      await handle.writeFile(JSON.stringify(op) + "\n", "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  /**
   * 큐 파일을 남은 변경분만으로 다시 쓴다(원자적 tmp→rename).
   * 플러시가 반영에 성공한 건들을 제거하되, 플러시 도중 append 된 건들은 보존하기 위해
   * "비우기"가 아니라 "남은 것 다시 쓰기"로 처리한다.
   */
  async rewrite(remaining: QueueOp[]): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const lines = remaining.map((op) => JSON.stringify(op));
    const body = lines.length ? lines.join("\n") + "\n" : "";
    const tmp = this.file + ".tmp";
    await writeFile(tmp, body, "utf8");
    await rename(tmp, this.file);
  }

  /** 디버깅/상태표시용. 큐 내용의 해시(변화 감지). */
  async fingerprint(): Promise<string> {
    try {
      const raw = await readFile(this.file, "utf8");
      return createHash("sha1").update(raw).digest("hex").slice(0, 12);
    } catch {
      return "empty";
    }
  }
}
