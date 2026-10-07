// GitHub Contents API 클라이언트. 로컬 git 바이너리·.git 없이 HTTPS로만 읽고 쓴다.
// 테스트에서 장애를 주입할 수 있도록 fetch 를 주입받는다.

export interface GitHubConfig {
  token: string;
  repo: string; // "owner/name"
  branch: string;
  // 커밋 author/committer 신원. 계정에 등록되지 않은 이메일을 쓰면 그 커밋은
  // 프로필 contribution graph(잔디)에 찍히지 않는다. 데이터 커밋이 코드 활동처럼
  // 보이지 않게 하려는 의도. 미지정 시 PAT 소유자(=내 계정)로 커밋되어 잔디가 생긴다.
  commitName?: string;
  commitEmail?: string;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** 원격 파일 1개의 내용과 blob sha. sha 는 이후 쓰기의 낙관적 동시성에 쓴다. */
export interface RemoteFile {
  text: string;
  sha: string;
}

/** 원격 쓰기가 sha 불일치로 거부됨(다른 곳에서 먼저 수정). 재읽기 후 병합해 재시도해야 한다. */
export class ConflictError extends Error {
  constructor(public readonly path: string) {
    super(`원격 파일이 변경되어 충돌: ${path}`);
    this.name = "ConflictError";
  }
}

/** 인증 실패. 토큰 만료/권한 부족. 재시도해도 소용없고 사용자 조치가 필요하다. */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/** 그 밖의 원격 오류(5xx, 네트워크, 레이트 리밋 등). 재시도 대상. */
export class TransientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "TransientError";
  }
}

const API = "https://api.github.com";

export class GitHubStore {
  constructor(
    private readonly config: GitHubConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  private contentsUrl(path: string): string {
    return `${API}/repos/${this.config.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`;
  }

  /** 파일을 읽는다. 없으면 null. 인증/일시 오류는 각각 AuthError/TransientError 로 던진다. */
  async read(path: string): Promise<RemoteFile | null> {
    const url = `${this.contentsUrl(path)}?ref=${encodeURIComponent(this.config.branch)}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, { headers: this.headers() });
    } catch (e) {
      throw new TransientError(`네트워크 오류: ${(e as Error).message}`);
    }

    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403) {
      // 403 은 레이트 리밋일 수도 있다. 남은 호출이 0이면 일시 오류로 본다.
      if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
        throw new TransientError("레이트 리밋", 403);
      }
      throw new AuthError(`인증 실패(${res.status}). 토큰 권한을 확인하세요.`);
    }
    if (!res.ok) throw new TransientError(`읽기 실패(${res.status})`, res.status);

    const body = (await res.json()) as { content?: string; encoding?: string; sha: string };
    if (body.encoding !== "base64" || typeof body.content !== "string") {
      throw new TransientError("예상치 못한 응답 형식");
    }
    // GitHub 은 base64 를 76자마다 줄바꿈해 준다. 제거 후 디코드.
    const text = Buffer.from(body.content.replace(/\n/g, ""), "base64").toString("utf8");
    return { text, sha: body.sha };
  }

  /**
   * 파일을 쓴다. sha 를 주면 그 버전 위에만 쓴다(낙관적 동시성).
   * sha 불일치면 ConflictError. 신규 파일은 sha 를 생략한다.
   * @returns 새 blob sha
   */
  async write(
    path: string,
    text: string,
    sha: string | undefined,
    message: string,
  ): Promise<string> {
    const payload: Record<string, unknown> = {
      message,
      content: Buffer.from(text, "utf8").toString("base64"),
      branch: this.config.branch,
    };
    if (sha) payload.sha = sha;
    // 전용 신원으로 커밋해 프로필 잔디에 찍히지 않게 한다(계정 미등록 이메일).
    if (this.config.commitName && this.config.commitEmail) {
      const identity = { name: this.config.commitName, email: this.config.commitEmail };
      payload.author = identity;
      payload.committer = identity;
    }

    let res: Response;
    try {
      res = await this.fetchImpl(this.contentsUrl(path), {
        method: "PUT",
        headers: { ...this.headers(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      throw new TransientError(`네트워크 오류: ${(e as Error).message}`);
    }

    if (res.status === 409) throw new ConflictError(path);
    // 신규 생성인데 이미 존재(sha 누락)하면 422. 충돌로 처리해 재읽기를 유도한다.
    if (res.status === 422 && !sha) throw new ConflictError(path);
    if (res.status === 401 || res.status === 403) {
      if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
        throw new TransientError("레이트 리밋", 403);
      }
      throw new AuthError(`인증 실패(${res.status}). 토큰 권한을 확인하세요.`);
    }
    if (!res.ok) throw new TransientError(`쓰기 실패(${res.status})`, res.status);

    const body = (await res.json()) as { content: { sha: string } };
    return body.content.sha;
  }
}
