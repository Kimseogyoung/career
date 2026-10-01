// 테스트용 가짜 GitHub Contents API. 메모리에 파일을 들고, 장애를 주입할 수 있다.
// 실제 네트워크 없이 503·409·401·타임아웃 경로를 재현하기 위한 것.
import type { FetchLike } from "./github";

interface StoredFile {
  content: string; // base64
  sha: string;
}

export type FailMode = "none" | "transient" | "auth" | "ratelimit" | "conflict";

export class FakeGitHub {
  private files = new Map<string, StoredFile>();
  private shaCounter = 0;

  // 다음 호출들에 주입할 장애. 호출 때마다 하나씩 소비한다(없으면 정상).
  private failQueue: FailMode[] = [];
  // 다음 write 때 한 번만 409 를 반환(읽기 후 쓰기 사이 제3자 수정 재현).
  private conflictNextWrites = 0;
  public reads = 0;
  public writes = 0;

  /** 다음 n개 요청(read/write 공통)에 장애를 주입한다. */
  injectFailures(...modes: FailMode[]): void {
    this.failQueue.push(...modes);
  }

  /** 다음 n번의 write 가 409(충돌)를 반환하게 한다. 재읽기→재적용→재시도 경로 테스트용. */
  injectWriteConflicts(n: number): void {
    this.conflictNextWrites += n;
  }

  private nextSha(): string {
    return `sha${++this.shaCounter}`;
  }

  private takeFail(): FailMode {
    return this.failQueue.shift() ?? "none";
  }

  private failResponse(mode: FailMode): Response {
    if (mode === "transient") return new Response("boom", { status: 503 });
    if (mode === "auth") return new Response("nope", { status: 401 });
    if (mode === "ratelimit") {
      return new Response("rate", { status: 403, headers: { "x-ratelimit-remaining": "0" } });
    }
    return new Response("boom", { status: 500 });
  }

  // path 를 URL 에서 뽑는다. contents/<path>?... 형태.
  private pathOf(url: string): string {
    const m = url.match(/\/contents\/(.+?)(\?|$)/);
    return m?.[1] ? decodeURIComponent(m[1]) : "";
  }

  /** 직접 파일을 심는다(테스트 선행 상태 구성용). */
  seed(path: string, text: string): string {
    const sha = this.nextSha();
    this.files.set(path, { content: Buffer.from(text, "utf8").toString("base64"), sha });
    return sha;
  }

  get(path: string): string | null {
    const f = this.files.get(path);
    return f ? Buffer.from(f.content, "base64").toString("utf8") : null;
  }

  readonly fetch: FetchLike = async (url, init) => {
    const method = init?.method ?? "GET";
    const path = this.pathOf(url);

    const fail = this.takeFail();
    if (fail !== "none") {
      if (method === "GET") this.reads++;
      else this.writes++;
      return this.failResponse(fail);
    }

    if (method === "GET") {
      this.reads++;
      const f = this.files.get(path);
      if (!f) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify({ content: f.content, encoding: "base64", sha: f.sha }), {
        status: 200,
      });
    }

    // PUT
    this.writes++;
    if (this.conflictNextWrites > 0) {
      this.conflictNextWrites--;
      return new Response("conflict", { status: 409 });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { content: string; sha?: string };
    const existing = this.files.get(path);
    // 낙관적 동시성: 기존 파일이 있는데 sha 가 다르면 409.
    if (existing && body.sha !== existing.sha) {
      return new Response("conflict", { status: 409 });
    }
    // 신규인데 sha 를 줬거나, 기존인데 sha 를 안 준 경우도 충돌로 본다.
    if (!existing && body.sha) {
      return new Response("conflict", { status: 409 });
    }
    const sha = this.nextSha();
    this.files.set(path, { content: body.content, sha });
    return new Response(JSON.stringify({ content: { sha } }), { status: 200 });
  };
}
