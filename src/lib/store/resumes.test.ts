import { test } from "node:test";
import assert from "node:assert/strict";
import type { PortfolioDoc } from "@/lib/export/portfolio";
import type { Achievement } from "./types";
import { FakeGitHub } from "./fake-github";
import { GitHubStore, TransientError } from "./github";
import { RESUMES_INDEX_PATH } from "./paths";
import { ResumeError, ResumeStore, cleanResumeName, resumePath, sourceIdsOf } from "./resumes";

// 내보내기 저장본. "목록에 있으면 본문이 있다"를 장애 경로까지 확인한다.

function setup() {
  const fake = new FakeGitHub();
  const github = new GitHubStore({ token: "t", repo: "o/r", branch: "main" }, fake.fetch);
  return { fake, github };
}

function ach(id: string, over: Partial<Achievement> = {}): Achievement {
  return {
    id,
    title: id,
    tech: [],
    star: false,
    sourceDates: [],
    createdBy: "manual",
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

function doc(title = "원래 제목"): PortfolioDoc {
  return {
    profile: { name: "김서경", techStack: [] },
    career: [],
    projects: [
      { id: "p1", name: "Horizon", photos: [], achievements: [ach("a1", { title }), ach("a2")] },
    ],
    loose: [ach("a3")],
    counts: { projects: 1, achievements: 3 },
  };
}

const OPTS = { starOnly: false, photos: true };

test("저장본: 저장 → 다른 인스턴스에서 목록·본문 그대로, 근거 성과 id 보관", async () => {
  const { fake, github } = setup();
  const d = doc();
  const meta = await new ResumeStore(github).save({ name: "  넥슨   지원용 ", kind: "portfolio", options: OPTS, doc: d });
  assert.equal(meta.name, "넥슨 지원용");
  assert.ok(fake.has(resumePath(meta.id)));

  const fresh = new ResumeStore(github); // 원격에서 다시 읽기
  assert.deepEqual((await fresh.list()).map((m) => m.id), [meta.id]);
  const body = await fresh.get(meta.id);
  assert.deepEqual(body!.sourceIds, ["a1", "a2", "a3"]);
  assert.equal(body!.doc.projects[0]!.achievements[0]!.title, "원래 제목");
  assert.deepEqual(body!.meta.counts, { projects: 1, achievements: 3 });
});

test("저장본: 저장 뒤 넘긴 객체를 고쳐도 저장본은 안 바뀐다(얼린 사본)", async () => {
  const { github } = setup();
  const d = doc();
  const store = new ResumeStore(github);
  const meta = await store.save({ name: "a", kind: "portfolio", options: OPTS, doc: d });
  d.projects[0]!.achievements[0]!.title = "나중에 고친 제목";
  assert.equal((await store.get(meta.id))!.doc.projects[0]!.achievements[0]!.title, "원래 제목");
  assert.equal((await new ResumeStore(github).get(meta.id))!.doc.projects[0]!.achievements[0]!.title, "원래 제목");
});

test("저장본: 목록은 최신순, 삭제하면 목록과 본문 파일이 함께 빠진다", async () => {
  const { fake, github } = setup();
  const store = new ResumeStore(github);
  const a = await store.save({ name: "첫째", kind: "portfolio", options: OPTS, doc: doc() });
  await new Promise((r) => setTimeout(r, 5));
  const b = await store.save({ name: "둘째", kind: "portfolio", options: { starOnly: true, photos: false }, doc: doc() });
  assert.deepEqual((await store.list()).map((m) => m.name), ["둘째", "첫째"]);

  assert.equal(await store.remove(a.id), true);
  assert.deepEqual((await new ResumeStore(github).list()).map((m) => m.id), [b.id]);
  assert.equal(fake.has(resumePath(a.id)), false);
  assert.equal(await store.get(a.id), null);
  assert.equal(await store.remove(a.id), false); // 이미 없음 → 원격 쓰기 없음
});

test("저장본: 목록 쓰기가 실패하면 본문 파일을 지우고 실패를 알린다(고아 파일 없음)", async () => {
  const { fake, github } = setup();
  const store = new ResumeStore(github);
  // 본문 PUT 정상 → 목록 GET 정상 → 목록 PUT 503
  fake.injectFailures("none", "none", "transient");
  await assert.rejects(
    store.save({ name: "x", kind: "portfolio", options: OPTS, doc: doc() }),
    TransientError,
  );
  assert.deepEqual(fake.paths("meta/resumes/"), []);
  assert.deepEqual(await new ResumeStore(github).list(), []);
});

test("저장본: 목록 PUT 409 한 번이면 재시도해서 성공", async () => {
  const { fake, github } = setup();
  const store = new ResumeStore(github);
  await store.save({ name: "먼저", kind: "portfolio", options: OPTS, doc: doc() });
  // 다음 PUT 두 번 중 본문은 신규 파일이라 409 를 주면 저장 자체가 실패한다.
  // 그래서 목록을 제3자가 바꿔 sha 가 어긋나는 상황을 직접 만든다.
  const raw = JSON.parse(fake.get(RESUMES_INDEX_PATH)!);
  const third = { ...raw.resumes[0], id: "01THIRDPARTYXXXXXXXXXXXXXX", name: "다른 탭" };
  let reads = 0;
  const original = github.read.bind(github);
  github.read = async (path: string) => {
    const r = await original(path);
    if (path === RESUMES_INDEX_PATH && reads++ === 0) {
      // 읽은 직후 다른 탭이 목록을 바꿨다 → 이번 쓰기는 409
      fake.seed(RESUMES_INDEX_PATH, JSON.stringify({ version: 1, resumes: [...raw.resumes, third] }));
    }
    return r;
  };
  await store.save({ name: "나중", kind: "portfolio", options: OPTS, doc: doc() });
  assert.deepEqual(
    (await new ResumeStore(github).list()).map((m) => m.name).sort(),
    ["나중", "다른 탭", "먼저"],
  );
});

test("저장본: 너무 큰 문서는 원격에 아무것도 쓰지 않고 거절", async () => {
  const { fake, github } = setup();
  const big = doc();
  big.loose = Array.from({ length: 400 }, (_, i) => ach(`b${i}`, { result: "가".repeat(1000) }));
  await assert.rejects(
    new ResumeStore(github).save({ name: "big", kind: "portfolio", options: OPTS, doc: big }),
    ResumeError,
  );
  assert.equal(fake.writes, 0);
});

test("저장본: 이상한 id 는 경로를 만들지 않고 null", async () => {
  const { github } = setup();
  const store = new ResumeStore(github);
  assert.equal(await store.get("../profile"), null);
  assert.equal(await store.remove("../profile"), false);
  assert.throws(() => resumePath("../x"));
});

test("저장본 이름: 공백 정리, 60자, 비면 기본값", () => {
  assert.equal(cleanResumeName("   ", "기본"), "기본");
  assert.equal(cleanResumeName(undefined, "기본"), "기본");
  assert.equal(cleanResumeName("가".repeat(80), "x").length, 60);
  assert.deepEqual(sourceIdsOf(doc()), ["a1", "a2", "a3"]);
});
