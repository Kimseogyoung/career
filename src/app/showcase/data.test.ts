import { test } from "node:test";
import assert from "node:assert/strict";
import type { Achievement, Profile, Project } from "@/lib/store/types";
import { buildShowcase, sortKey, yearLabel } from "./data";

// 공개 Showcase 데이터 변환. 무엇이 브라우저로 나가는지가 곧 공개 범위다(ADR-013).

const profile: Profile = { intro: "소개", techStack: [], career: [] };

function ach(id: string, over: Partial<Achievement> = {}): Achievement {
  return {
    id,
    title: id,
    tech: [],
    star: false,
    sourceDates: [],
    createdBy: "ai",
    createdAt: "2026-10-10T12:00:00.000Z",
    updatedAt: "2026-10-10T12:00:00.000Z",
    ...over,
  };
}

const proj: Project = {
  id: "p1",
  name: "라이브 게임 서버",
  order: 0,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

test("hidden 성과는 공개 데이터에서 빠진다", () => {
  const out = buildShowcase([ach("a"), ach("b", { hidden: true })], [], profile);
  assert.deepEqual(
    out.achievements.map((a) => a.id),
    ["a"],
  );
});

test("정렬은 생성 시각이 아니라 근거 날짜 최신순", () => {
  // 셋 다 같은 날 백필(createdAt 동일)돼도 근거 날짜로 정렬돼야 한다.
  const out = buildShowcase(
    [
      ach("old", { sourceDates: ["2023-05-01"] }),
      ach("new", { sourceDates: ["2026-09-28"] }),
      ach("mid", { sourceDates: ["2024-01-01", "2025-06-01"] }),
    ],
    [],
    profile,
  );
  assert.deepEqual(
    out.achievements.map((a) => a.id),
    ["new", "mid", "old"],
  );
});

test("근거 날짜가 없으면 생성일로 대신 정렬한다", () => {
  assert.equal(sortKey({ sourceDates: [], createdAt: "2026-10-10T12:00:00.000Z" }), "2026-10-10");
  assert.equal(sortKey({ sourceDates: ["2026-01-02"], createdAt: "2026-10-10T12:00:00.000Z" }), "2026-01-02");
});

test("공개 DTO 에는 허용 필드만 — 내부 필드는 나가지 않는다", () => {
  const out = buildShowcase(
    [ach("a", { projectId: "p1", star: true, sourceDates: ["2025-03-01", "2026-02-01"] })],
    [proj],
    profile,
  );
  const a = out.achievements[0]! as unknown as Record<string, unknown>;
  for (const k of ["createdAt", "updatedAt", "createdBy", "sourceDates", "hidden"]) {
    assert.equal(k in a, false, `${k} 가 공개 데이터에 있으면 안 됨`);
  }
  assert.equal(a.year, "2025–2026");
  assert.equal(a.projectId, "p1");
  const p = out.projects[0]! as unknown as Record<string, unknown>;
  for (const k of ["createdAt", "updatedAt", "order"]) assert.equal(k in p, false, k);
});

test("삭제된 프로젝트를 가리키는 projectId 는 공개 데이터에서 비운다('기타'로 묶임)", () => {
  const out = buildShowcase([ach("a", { projectId: "gone" })], [proj], profile);
  assert.equal(out.achievements[0]!.projectId, undefined);
});

test("연도 라벨", () => {
  assert.equal(yearLabel([]), null);
  assert.equal(yearLabel(["2026-01-01", "2026-05-01"]), "2026");
  assert.equal(yearLabel(["2026-01-01", "2023-05-01"]), "2023–2026");
});
