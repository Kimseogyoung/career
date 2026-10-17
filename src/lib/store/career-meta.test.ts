import { test } from "node:test";
import assert from "node:assert/strict";
import { AchievementStore } from "./achievements";
import { FakeGitHub } from "./fake-github";
import { GitHubStore, TransientError } from "./github";
import { PROFILE_PATH, PROJECTS_PATH } from "./paths";
import { ProfileStore } from "./profile";
import { ProjectStore } from "./projects";

// 커리어 메타데이터(프로젝트·내 정보·성과 필드) 저장. 정상 경로뿐 아니라 충돌·장애 경로를 같이 본다.

function setup() {
  const fake = new FakeGitHub();
  const github = new GitHubStore({ token: "t", repo: "o/r", branch: "main" }, fake.fetch);
  return { fake, github };
}

// ── 프로젝트 ──────────────────────────────────────────────────────

test("프로젝트: 추가하면 순서가 이어지고 목록은 순서대로", async () => {
  const { github } = setup();
  const store = new ProjectStore(github);
  const a = await store.add({ name: " 라이브 게임 서버 ", period: "2025 – 현재" });
  const b = await store.add({ name: "대규모 라이브 서비스" });
  assert.equal(a?.name, "라이브 게임 서버");
  assert.equal(a?.order, 0);
  assert.equal(b?.order, 1);
  const list = await new ProjectStore(github).list(); // 새 인스턴스 = 원격에서 다시 읽기
  assert.deepEqual(
    list.map((p) => p.name),
    ["라이브 게임 서버", "대규모 라이브 서비스"],
  );
});

test("프로젝트: 이름이 비면 추가하지 않고 원격도 건드리지 않는다", async () => {
  const { fake, github } = setup();
  const store = new ProjectStore(github);
  assert.equal(await store.add({ name: "   " }), null);
  assert.equal(fake.writes, 0);
});

test("프로젝트: 없는 id 수정·삭제는 원격 쓰기 없음", async () => {
  const { fake, github } = setup();
  const store = new ProjectStore(github);
  await store.add({ name: "A" });
  const before = fake.writes;
  assert.equal(await store.update("nope", { name: "B" }), null);
  await store.remove("nope");
  assert.equal(fake.writes, before);
});

test("프로젝트: 수정 — 빈 이름은 무시, 빈 기간은 제거", async () => {
  const { github } = setup();
  const store = new ProjectStore(github);
  const p = await store.add({ name: "A", period: "2025" });
  const u = await store.update(p!.id, { name: "  ", period: "" });
  assert.equal(u?.name, "A");
  assert.equal(u?.period, undefined);
});

test("프로젝트: 쓰기 충돌(409) 1회 → 재시도로 저장, 중복 생성 없음", async () => {
  const { fake, github } = setup();
  const store = new ProjectStore(github);
  fake.injectWriteConflicts(1);
  await store.add({ name: "A" });
  const list = await new ProjectStore(github).list();
  assert.equal(list.length, 1);
});

test("프로젝트: 쓰기 장애(503)면 던지고 원격 데이터는 그대로", async () => {
  const { fake, github } = setup();
  const store = new ProjectStore(github);
  await store.add({ name: "A" });
  const saved = fake.get(PROJECTS_PATH);
  fake.injectFailures("none", "transient"); // 읽기는 정상, 쓰기만 503
  await assert.rejects(store.add({ name: "B" }), TransientError);
  assert.equal(fake.get(PROJECTS_PATH), saved);
});

// ── 내 정보 ──────────────────────────────────────────────────────

test("내 정보: 원격이 비어 있으면 기본값(빈 목록)", async () => {
  const { github } = setup();
  const p = await new ProfileStore(github).get();
  assert.deepEqual(p.techStack, []);
  assert.deepEqual(p.career, []);
  assert.equal(p.intro, undefined);
});

test("내 정보: 저장 시 정리 — 빈 그룹·빈 경력 제거, 기술 trim, 경력 id 부여", async () => {
  const { github } = setup();
  await new ProfileStore(github).put({
    intro: "  두 줄 소개  ",
    techStack: [
      { label: " 언어 ", items: [" C# ", "", ".NET"] },
      { label: "", items: [] },
    ],
    career: [{ id: "", org: "스튜디오", role: "서버" }, { id: "x" }],
  });
  const p = await new ProfileStore(github).get(); // 원격에서 복원
  assert.equal(p.intro, "두 줄 소개");
  assert.deepEqual(p.techStack, [{ label: "언어", items: ["C#", ".NET"] }]);
  assert.equal(p.career.length, 1);
  assert.equal(p.career[0]!.org, "스튜디오");
  assert.ok(p.career[0]!.id.length > 0);
});

test("내 정보: 깨진 JSON 이면 기본값으로 읽는다(앱이 죽지 않음)", async () => {
  const { fake, github } = setup();
  fake.seed(PROFILE_PATH, "{ not json");
  const p = await new ProfileStore(github).get();
  assert.deepEqual(p.techStack, []);
});

test("내 정보: 쓰기 충돌(409) 1회 → 재시도로 저장", async () => {
  const { fake, github } = setup();
  fake.injectWriteConflicts(1);
  await new ProfileStore(github).put({ intro: "소개", techStack: [], career: [] });
  assert.equal((await new ProfileStore(github).get()).intro, "소개");
});

test("내 정보: 쓰기 장애(503)면 던지고 원격·캐시는 이전 값", async () => {
  const { fake, github } = setup();
  const store = new ProfileStore(github);
  await store.put({ intro: "이전", techStack: [], career: [] });
  fake.injectFailures("none", "transient");
  await assert.rejects(store.put({ intro: "새것", techStack: [], career: [] }), TransientError);
  assert.equal((await store.get()).intro, "이전");
  assert.equal((await new ProfileStore(github).get()).intro, "이전");
});

// ── 성과: 프로젝트 연결·숨김 ─────────────────────────────────────

test("성과: projectId·hidden 저장, 빈 문자열/false 로 해제된다", async () => {
  const { github } = setup();
  const store = new AchievementStore(github);
  const [a] = await store.addMany([{ title: "T", projectId: "p1", hidden: true }]);
  assert.equal(a!.projectId, "p1");
  assert.equal(a!.hidden, true);
  const u = await store.update(a!.id, { projectId: "", hidden: false });
  assert.equal(u?.projectId, undefined); // '미지정'으로 되돌릴 수 있어야 한다
  assert.equal(u?.hidden, undefined);
});

test("성과: 생성 시 projectId 가 문자열이 아니면 무시(예외 없이)", async () => {
  const { github } = setup();
  const store = new AchievementStore(github);
  const bad = { title: "T", projectId: 123 } as unknown as { title: string; projectId: string };
  const [a] = await store.addMany([bad]);
  assert.equal(a!.projectId, undefined);
});
