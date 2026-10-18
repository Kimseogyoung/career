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

test("프로젝트: 기간 최신순 — 진행 중 → 종료 늦은 순, 날짜 없는 건 아래", async () => {
  const { github } = setup();
  const store = new ProjectStore(github);
  await store.add({ name: "메타버스킹", start: { date: "2021-03" }, end: { date: "2021-12" } });
  await store.add({ name: "날짜 없음" });
  await store.add({ name: "현 프로젝트", start: { date: "2025-03", note: "합류" }, end: { ongoing: true } });
  await store.add({ name: "그랑사가", start: { date: "2023-01" }, end: { date: "2024-05", note: "출시" } });
  const list = await new ProjectStore(github).list(); // 새 인스턴스 = 원격에서 다시 읽기
  assert.deepEqual(
    list.map((p) => p.name),
    ["현 프로젝트", "그랑사가", "메타버스킹", "날짜 없음"],
  );
  assert.deepEqual(list[1]!.end, { date: "2024-05", note: "출시" });
});

test("프로젝트: 잘못된 날짜는 버리고, 진행 중이면 종료 날짜는 버림(코멘트는 자르지 않음)", async () => {
  const { github } = setup();
  const store = new ProjectStore(github);
  const p = await store.add({
    name: "A",
    start: { date: "2024-13", note: "합류" },
    end: { ongoing: true, date: "2024-05", note: "아주아주아주아주아주아주아주아주긴 코멘트입니다" },
  });
  assert.equal(p!.start?.date, undefined);
  assert.equal(p!.start?.note, "합류");
  assert.equal(p!.end?.ongoing, true);
  assert.equal(p!.end?.date, undefined);
  assert.equal(p!.end?.note, "아주아주아주아주아주아주아주아주긴 코멘트입니다");
});

test("프로젝트 마이그레이션: 예전 period 글자 → 시작/종료(+코멘트), 실패하면 원문 보존", async () => {
  const { fake, github } = setup();
  fake.seed(
    PROJECTS_PATH,
    JSON.stringify({
      version: 1,
      projects: [
        { id: "01AAAAAAAAAAAAAAAAAAAAAAAA", name: "그랑사가", period: "2023.01 – 2024.05 출시", order: 0, createdAt: "", updatedAt: "" },
        { id: "01BBBBBBBBBBBBBBBBBBBBBBBB", name: "현", period: "2025.03 – 현재", order: 1, createdAt: "", updatedAt: "" },
        { id: "01CCCCCCCCCCCCCCCCCCCCCCCC", name: "옛", period: "2021", order: 2, createdAt: "", updatedAt: "" },
      ],
    }),
  );
  const list = await new ProjectStore(github).list();
  const by = Object.fromEntries(list.map((p) => [p.name, p]));
  assert.deepEqual(by["그랑사가"]!.start, { date: "2023-01" });
  assert.deepEqual(by["그랑사가"]!.end, { date: "2024-05", note: "출시" });
  assert.equal(by["그랑사가"]!.period, undefined);
  assert.equal(by["현"]!.end?.ongoing, true);
  assert.equal(by["현"]!.end?.note, undefined); // "현재" 는 코멘트로 남기지 않음
  assert.equal(by["옛"]!.period, "2021"); // 연도만 — 원문 보존, 화면에서 수정 유도
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

test("프로젝트: 수정 — 빈 이름은 무시, 기간은 null 로 지울 수 있음", async () => {
  const { github } = setup();
  const store = new ProjectStore(github);
  const p = await store.add({ name: "A", start: { date: "2024-01" }, end: { ongoing: true } });
  const u = await store.update(p!.id, { name: "  ", end: null });
  assert.equal(u?.name, "A");
  assert.equal(u?.end, undefined);
  assert.deepEqual(u?.start, { date: "2024-01" });
});

// ── 프로젝트 사진 ─────────────────────────────────────────────────

const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

test("사진: 올리면 meta/media 에 파일, 목록에 등록, 등록된 것만 읽힌다", async () => {
  const { fake, github } = setup();
  const store = new ProjectStore(github);
  const p = await store.add({ name: "A" });
  const photo = await store.addPhoto(p!.id, WEBP, { width: 1600, height: 900, caption: "로비" });
  assert.equal(photo.ext, "webp");
  assert.ok(fake.has(`meta/media/${p!.id}/${photo.id}.webp`));
  const fresh = new ProjectStore(github);
  const read = await fresh.readPhoto(p!.id, photo.id);
  assert.deepEqual(Array.from(read!.bytes), Array.from(WEBP));
  assert.equal(await fresh.readPhoto(p!.id, "01ZZZZZZZZZZZZZZZZZZZZZZZZ"), null); // 등록 안 된 id
});

test("사진: 형식은 바이트로 판별 — SVG(스크립트 가능)·알 수 없는 형식은 거부, 원격 쓰기 없음", async () => {
  const { fake, github } = setup();
  const store = new ProjectStore(github);
  const p = await store.add({ name: "A" });
  const before = fake.writes;
  await assert.rejects(store.addPhoto(p!.id, SVG, { width: 1, height: 1 }), /unsupported/);
  assert.equal(fake.writes, before);
  const png = await store.addPhoto(p!.id, PNG, { width: 1, height: 1 });
  assert.equal(png.ext, "png");
});

test("사진: 최대 10장", async () => {
  const { github } = setup();
  const store = new ProjectStore(github);
  const p = await store.add({ name: "A" });
  for (let i = 0; i < 10; i++) await store.addPhoto(p!.id, WEBP, { width: 1, height: 1 });
  await assert.rejects(store.addPhoto(p!.id, WEBP, { width: 1, height: 1 }), /too_many/);
});

test("사진: 목록 등록이 실패하면 올린 파일을 지운다(고아 파일 방지)", async () => {
  const { fake, github } = setup();
  const store = new ProjectStore(github);
  const p = await store.add({ name: "A" });
  await store.list(); // 캐시 확보
  // 사진 파일 쓰기는 성공, 그다음 목록 읽기→쓰기 중 쓰기가 503
  fake.injectFailures("none", "none", "transient");
  await assert.rejects(store.addPhoto(p!.id, WEBP, { width: 1, height: 1 }), TransientError);
  assert.deepEqual(fake.paths(`meta/media/${p!.id}/`), []); // 올렸던 파일이 정리됨
  const after = await new ProjectStore(github).list();
  assert.equal(after[0]!.photos?.length ?? 0, 0);
});

test("사진: 순서·설명 변경, 삭제하면 파일도 지운다, 프로젝트 삭제 시 사진 파일 정리", async () => {
  const { fake, github } = setup();
  const store = new ProjectStore(github);
  const p = await store.add({ name: "A" });
  const a = await store.addPhoto(p!.id, WEBP, { width: 1, height: 1 });
  const b = await store.addPhoto(p!.id, PNG, { width: 1, height: 1 });
  const u = await store.update(p!.id, { photos: [{ id: b.id, caption: "대표" }, { id: a.id }] });
  assert.deepEqual(u!.photos!.map((x) => x.id), [b.id, a.id]);
  assert.equal(u!.photos![0]!.caption, "대표");

  assert.equal(await store.removePhoto(p!.id, a.id), true);
  assert.equal(fake.has(`meta/media/${p!.id}/${a.id}.webp`), false);

  await store.remove(p!.id);
  assert.equal(fake.has(`meta/media/${p!.id}/${b.id}.png`), false);
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

test("내 정보 경력: 최신순 정렬(재직 중 맨 위), 재직 중이면 종료 월 버림, 비고는 자르지 않음(남용 상한만)", async () => {
  const { github } = setup();
  const saved = await new ProfileStore(github).put({
    techStack: [],
    career: [
      { id: "a", org: "엔픽셀", start: "2022-07", end: "2023-12" },
      { id: "b", org: "파이드픽셀즈", start: "2024-01", end: "2024-05", current: true },
      { id: "c", org: "잘못된 날짜", start: "2024-13", note: "x".repeat(800) },
      { id: "d", org: "남용", note: "y".repeat(9000) },
    ],
  });
  assert.deepEqual(
    saved.career.map((c) => c.org),
    ["파이드픽셀즈", "엔픽셀", "잘못된 날짜", "남용"],
  );
  assert.equal(saved.career[0]!.end, undefined); // 재직 중
  assert.equal(saved.career[2]!.start, undefined); // 잘못된 월은 버림
  assert.equal(saved.career[2]!.note!.length, 800); // 화면 한도(500)보다 길어도 서버는 보존
  assert.equal(saved.career[3]!.note!.length, 4000); // 남용 방지 상한
});

test("내 정보 마이그레이션: 'yyyy.mm - 현재'·'yyyy.mm - yyyy.mm' 글자 → 시작/종료", async () => {
  const { fake, github } = setup();
  fake.seed(
    PROFILE_PATH,
    JSON.stringify({
      version: 1,
      profile: {
        career: [
          { id: "1", org: "엔픽셀", period: "2022.07 - 2023.12" },
          { id: "2", org: "파이드픽셀즈", period: "2024.01 – 현재" },
          { id: "3", org: "모름", period: "2019년부터" },
        ],
      },
    }),
  );
  const c = (await new ProfileStore(github).get()).career;
  assert.deepEqual(
    c.map((x) => [x.org, x.start, x.end, x.current, x.period]),
    [
      ["파이드픽셀즈", "2024-01", undefined, true, undefined],
      ["엔픽셀", "2022-07", "2023-12", undefined, undefined],
      ["모름", undefined, undefined, undefined, "2019년부터"], // 옮기지 못함 — 원문 보존
    ],
  );
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
