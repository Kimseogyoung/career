import { test } from "node:test";
import assert from "node:assert/strict";
import type { Achievement, Profile, Project } from "@/lib/store/types";
import { buildPortfolio } from "./portfolio";

const NOW = "2026-10";

function ach(id: string, over: Partial<Achievement> = {}): Achievement {
  return {
    id,
    title: id,
    tech: [],
    star: false,
    sourceDates: [],
    createdBy: "manual",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function proj(id: string, over: Partial<Project> = {}): Project {
  return { id, name: id, order: 0, createdAt: "", updatedAt: "", ...over };
}

const profile: Profile = {
  name: "김서경",
  email: "me@example.com",
  techStack: [],
  career: [
    { id: "now", org: "파이드픽셀즈", role: "서버", start: "2024-01", current: true },
    { id: "old", org: "엔픽셀", start: "2022-07", end: "2023-12" },
  ],
};

test("포트폴리오: 경력은 목록만(성과 없음), 프로젝트는 최신순 + 회사 표시 + 성과", () => {
  const doc = buildPortfolio(
    [
      ach("a1", { projectId: "horizon", sourceDates: ["2026-05-01"] }),
      ach("a2", { projectId: "horizon", sourceDates: ["2026-09-01"] }),
      ach("a3", { projectId: "gransaga" }),
      ach("a4"),
    ],
    [
      proj("gransaga", { start: { date: "2022-08" }, end: { date: "2023-10" } }),
      proj("horizon", { start: { date: "2025-07" }, end: { ongoing: true } }),
      proj("study", { start: { date: "2019-01" }, end: { date: "2019-06" } }),
    ],
    profile,
    NOW,
  );
  assert.deepEqual(
    doc.projects.map((p) => [p.id, p.org]),
    [
      ["horizon", "파이드픽셀즈"],
      ["gransaga", "엔픽셀"],
      ["study", undefined],
    ],
  );
  // 성과는 근거 날짜 최신순
  assert.deepEqual(doc.projects[0]!.achievements.map((a) => a.id), ["a2", "a1"]);
  assert.deepEqual(doc.loose.map((a) => a.id), ["a4"]);
  // 경력은 성과 없이 목록만, 성과가 없는 회사도 빠지지 않는다
  assert.deepEqual(doc.career.map((c) => c.org), ["파이드픽셀즈", "엔픽셀"]);
  assert.equal(doc.career[0]!.period, "2024.01 – 현재 (2년 10개월)");
  assert.ok(!("achievements" in doc.career[0]!));
  assert.deepEqual(doc.counts, { projects: 3, achievements: 4 });
});

test("포트폴리오: 직접 고른 회사가 기간 추정보다 우선", () => {
  const doc = buildPortfolio(
    [],
    [proj("p", { start: { date: "2025-01" }, end: { ongoing: true }, careerId: "old" })],
    profile,
    NOW,
  );
  assert.equal(doc.projects[0]!.org, "엔픽셀");
});

test("포트폴리오: 숨긴 성과 제외, ⭐만이면 ⭐ 없는 프로젝트도 뺀다, 사진 빼기", () => {
  const photos = [{ id: "ph", ext: "webp" as const, width: 10, height: 10, bytes: 1 }];
  const achievements = [
    ach("star", { projectId: "p1", star: true }),
    ach("plain", { projectId: "p2" }),
    ach("hidden", { projectId: "p1", star: true, hidden: true }),
  ];
  const projects = [
    proj("p1", { start: { date: "2025-01" }, photos }),
    proj("p2", { start: { date: "2025-02" } }),
  ];
  const all = buildPortfolio(achievements, projects, profile, NOW);
  assert.equal(all.counts.achievements, 2);
  assert.equal(all.projects.find((p) => p.id === "p1")!.photos.length, 1);

  const starred = buildPortfolio(achievements, projects, profile, NOW, { starOnly: true, photos: false });
  assert.deepEqual(starred.projects.map((p) => p.id), ["p1"]);
  assert.deepEqual(starred.projects[0]!.achievements.map((a) => a.id), ["star"]);
  assert.equal(starred.projects[0]!.photos.length, 0);
});
