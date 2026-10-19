import { test } from "node:test";
import assert from "node:assert/strict";
import type { Achievement, Position, PositionsFile, Profile } from "@/lib/store/types";
import { FakeGitHub } from "@/lib/store/fake-github";
import { GitHubStore, TransientError } from "@/lib/store/github";
import { POSITIONS_PATH } from "@/lib/store/paths";
import { PositionStore, mergeRun, type RunResult } from "@/lib/store/positions";
import { collectGamejob, toDetail } from "./collector";
import { sanitizeDuties } from "./duties";
import {
  parseCareer,
  parseDeadline,
  parseDetail,
  parseList,
  parseRegistered,
  parseTotal,
} from "./gamejob";
import { buildMe, careerScore, scorePosting } from "./score";
import { buildDict, canonical, findTechs, splitTechLabel } from "./tech-dict";

// 추천 포지션: 게임잡 파서(실제 마크업 구조를 본뜬 고정 샘플) · 점수 · 병합 · 수집기(부하 규칙).

// ── 고정 샘플 ─────────────────────────────────────────────────────

function listRow(gno: number, company: string, title: string, info: string[], date: string, reg: string) {
  return `
<tr>
<td>
<div class="company noLogo">
<a href="/Company/Detail?tabcode=1&M=1" target="_blank">
<strong>${company}</strong>
</a>
</div>
</td>
<td>
<div class="tit">
<a href="/Recruit/GI_Read/View?GI_No=${gno}" onclick="GA_Application_Prdt('02_공고클릭', 'N', '${title}')">${title}</a>
<button type="button" id="btnScrap_${gno}" class="btnScrap" title="채용공고 스크랩">스크랩</button>
<p class="info">
${info.map((i) => `<span>${i}</span>`).join("\n")}
</p>
</div>
</td>
<td><span class="date">${date}</span><span class="modifyDate">${reg}</span></td>
</tr>`;
}

const LIST_HTML = `
<div class="jobListWrap">
<span class="count totalJobcnt">(3)</span>
<table><tbody>
${listRow(283938, "㈜이스트게임즈", "[신입] 모바일 RTS 서버 프로그래머", ["신입", "학력무관", "서울 &gt; 서초구", "모바일게임", "정규직"], "채용시", "10/08(목) 등록")}
${listRow(283937, "㈜이스트게임즈", "[경력] 모바일 RTS 서버 프로그래머", ["경력3년↑", "학력무관", "서울 &gt; 서초구", "모바일게임", "정규직"], "~11/08", "2일 전 등록")}
${listRow(283937, "㈜이스트게임즈", "[경력] 모바일 RTS 서버 프로그래머", ["경력3년↑", "학력무관", "서울 &gt; 서초구", "모바일게임", "정규직"], "~11/08", "2일 전 등록")}
${listRow(285000, "넥스트 &amp; 스튜디오", "MMORPG 서버", ["경력무관", "학력무관", "경기 &gt; 성남시", "온라인PC게임", "정규직, 계약직"], "상시", "오늘 등록")}
</tbody></table></div>`;

const DETAIL_HTML = `
<html><head><style>body { font-size: 16px; line-height: 28px; }</style></head><body>
<p>이스트게임즈는 Unity 와 Kafka 로 만든 게임을 서비스합니다.</p>
<p>&#10004;</p>
<p><b>이런 업무를 담당합니다</b></p>
<p>- 전략대전게임 서버 컨텐츠 개발</p>
<p>- PvP 실시간 전투 개발</p>
<p>&#10004;</p>
<p><b>이런 역량을 갖춘 분을 찾습니다</b></p>
<p>- C# 서버 개발 경력 3년 이상</p>
<p>- Redis 사용 경험 필수</p>
<p>※ 포트폴리오 제출필수</p>
<p>&#10004;</p>
<p><b>이런 역량이 있으면 더욱 좋습니다</b></p>
<p>- DBMS(MySQL, MongoDB)</p>
<p>- Go 언어, 레디스 클러스터</p>
<p><b>복지 및 혜택</b></p>
<p>- AWS 크레딧 지원</p>
</body></html>`;

// ── 파서 ─────────────────────────────────────────────────────────

test("목록: 공고 번호·회사·제목·경력·지역·마감·등록, 광고 칸 중복은 하나로", () => {
  const items = parseList(LIST_HTML);
  assert.deepEqual(items.map((i) => i.gno), [283938, 283937, 285000]);
  const b = items[1]!;
  assert.equal(b.company, "㈜이스트게임즈");
  assert.equal(b.title, "[경력] 모바일 RTS 서버 프로그래머");
  assert.equal(b.career, "경력3년↑");
  assert.equal(b.local, "서울 > 서초구");
  assert.equal(b.deadline, "~11/08");
  assert.equal(items[2]!.company, "넥스트 & 스튜디오");
  assert.equal(items[2]!.employ, "정규직, 계약직");
  assert.equal(parseTotal(LIST_HTML), 3);
});

test("상세: 제목 줄로 담당업무·필수·우대를 나누고, 복지·소개 구역은 버린다", () => {
  const d = parseDetail(DETAIL_HTML);
  assert.equal(d.imageOnly, false);
  assert.match(d.sections.duty, /PvP 실시간 전투/);
  assert.match(d.sections.req, /C# 서버 개발/);
  assert.match(d.sections.req, /Redis 사용 경험 필수/); // "필수"가 들어간 내용 줄은 제목이 아니다
  assert.match(d.sections.pref, /MySQL, MongoDB/);
  assert.doesNotMatch(d.sections.pref, /AWS/); // 복지 구역
  assert.match(d.sections.etc, /Unity/); // 제목 앞 소개글
  assert.deepEqual(d.summary, ["전략대전게임 서버 컨텐츠 개발", "PvP 실시간 전투 개발"]);
});

test("상세: 글자가 거의 없고 이미지뿐이면 이미지 공고", () => {
  const d = parseDetail(`<div><img src="a.jpg"><img src="b.jpg"></div><p>지원하기</p>`);
  assert.equal(d.imageOnly, true);
});

test("경력·마감·등록일 해석", () => {
  assert.deepEqual(parseCareer("경력3년↑"), { newOnly: false, any: false, minYears: 3 });
  assert.deepEqual(parseCareer("경력 3~7년"), { newOnly: false, any: false, minYears: 3, maxYears: 7 });
  assert.equal(parseCareer("경력무관").any, true);
  assert.equal(parseCareer("신입·경력").any, true);
  assert.equal(parseCareer("신입").newOnly, true);
  assert.deepEqual(parseDeadline("~11/08", "2026-10-19"), { kind: "date", date: "2026-11-08" });
  assert.deepEqual(parseDeadline("~01/05", "2026-10-19"), { kind: "date", date: "2027-01-05" });
  assert.deepEqual(parseDeadline("상시", "2026-10-19"), { kind: "open", label: "상시" });
  assert.equal(parseRegistered("10/08(목) 등록", "2026-10-19"), "2026-10-08");
  assert.equal(parseRegistered("12/30(수) 등록", "2026-01-03"), "2025-12-30");
  assert.equal(parseRegistered("2일 전 등록", "2026-10-19"), "2026-10-17");
  assert.equal(parseRegistered("오늘 등록", "2026-10-19"), "2026-10-19");
});

// ── 기술 사전 ────────────────────────────────────────────────────

test("기술 사전: 별칭·한글 표기를 하나로, 짧은 이름 오탐 방지", () => {
  const dict = buildDict(["AWS(EC2, ALB)", "Addressables"]);
  assert.deepEqual(splitTechLabel("AWS(EC2, ALB)"), ["AWS", "EC2", "ALB"]);
  assert.equal(canonical(dict, "레디스"), "Redis");
  assert.equal(canonical(dict, "sql server"), "MSSQL");
  assert.equal(canonical(dict, "EC2"), "EC2");
  assert.deepEqual(findTechs(dict, "Google 과 Gonna 는 아니고 Go 언어"), ["Go"]);
  assert.deepEqual(findTechs(dict, "GitHub 사용"), []);
  assert.deepEqual(findTechs(dict, "C++ 와 C#, Addressables"), ["C++", "C#", "Addressables"]);
});

// ── 점수 ─────────────────────────────────────────────────────────

const NOW = "2026-10";
function ach(id: string, tech: string[], over: Partial<Achievement> = {}): Achievement {
  return {
    id,
    title: id,
    tech,
    star: false,
    sourceDates: [],
    createdBy: "manual",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}
const profile: Profile = {
  techStack: [{ label: "언어", items: ["C#", "MySQL", "AWS(EC2, ALB)"] }],
  career: [{ id: "c", org: "A", start: "2020-08", current: true }], // 6년 3개월
};

function posting(over: Partial<Position> = {}): Position {
  const dict = buildDict(["C#", "MySQL", "AWS"]);
  return {
    gno: 1,
    company: "A",
    title: "서버",
    career: "경력3년↑",
    deadline: "상시",
    firstSeen: "2026-10-19T00:00:00Z",
    detail: toDetail(parseDetail(DETAIL_HTML), dict, "2026-10-19T00:00:00Z"),
    ...over,
  };
}

test("점수: 필수 2·우대 1 가중 기술 일치 + 경력 + 성과로 증명된 정도", () => {
  const me = buildMe(profile, [ach("a1", ["C#"], { star: true }), ach("a2", ["Redis", "C#"])], NOW);
  const s = scorePosting(posting(), me);
  // 필수: C#(有), Redis(有) / 우대·업무: MySQL(有), MongoDB(無), Go(無). 소개글의 Unity·Kafka 는 세지 않음.
  assert.deepEqual(s.matched.map((m) => [m.name, m.section]), [["C#", "req"], ["Redis", "req"], ["MySQL", "pref"]]);
  assert.deepEqual(s.missing.map((m) => m.name).sort(), ["Go", "MongoDB"]);
  // 기술 60 * (2+2+1)/(2+2+1+1+1) = 42.86, 경력 25, 깊이 15*(2*1 + 2*0.7 + 1*0)/5 = 10.2 → 78
  assert.equal(s.score, 78);
  assert.equal(s.career, "ok");
  assert.equal(s.uncertain, null);
  assert.deepEqual(s.evidence.map((e) => e.id), ["a1", "a2"]); // ⭐ 먼저
});

test("점수: 공고 기술이 적으면 만점 대신 중간값 쪽으로(근거가 적으면 확신도 적게)", () => {
  const me = buildMe(profile, [], NOW);
  const few = posting({
    detail: { fetchedAt: "", imageOnly: false, terms: { duty: [], req: [], pref: ["C#"], etc: [] }, summary: [] },
  });
  // 우대 C# 1개만 맞음: 원점수 60 → 30 + 30*(1/5) = 36, + 경력 25 + 깊이 0 = 61
  assert.equal(scorePosting(few, me).score, 61);
});

test("상세: '자격사항' 도 필수 구역 제목", () => {
  const d = parseDetail("<p>자격사항</p><p>- Redis 경험</p>");
  assert.match(d.sections.req, /Redis/);
});

test("점수: 신입 전용·경력 많이 모자람은 기술이 맞아도 49점 상한", () => {
  const me = buildMe(profile, [ach("a1", ["C#", "Redis", "MySQL"], { star: true })], NOW);
  assert.equal(scorePosting(posting({ career: "신입" }), me).score, 49);
  assert.equal(scorePosting(posting({ career: "경력10년↑" }), me).score, 49);
  assert.ok(scorePosting(posting(), me).score > 49);
});

test("점수: 숨긴 성과는 근거로 쓰지 않는다", () => {
  const me = buildMe(profile, [ach("h", ["Redis"], { hidden: true })], NOW);
  assert.ok(scorePosting(posting(), me).missing.some((m) => m.name === "Redis"));
});

test("점수: 이미지 공고·상세 미수집은 기술 중간값 + 경력만, '?' 표시", () => {
  const me = buildMe(profile, [], NOW);
  const img = scorePosting(posting({ detail: { fetchedAt: "", imageOnly: true, terms: { duty: [], req: [], pref: [], etc: [] }, summary: [] } }), me);
  assert.equal(img.uncertain, "image");
  assert.equal(img.score, 30 + 25);
  assert.equal(scorePosting(posting({ detail: undefined }), me).uncertain, "noDetail");
});

test("경력 점수: 충족 25 · 무관 20 · 초과 15 · 1년 이내 부족 10 · 그 외 0 · 신입 전용 0", () => {
  const y = (n: number) => n * 12;
  assert.equal(careerScore("경력3년↑", y(6)).points, 25);
  assert.equal(careerScore("경력무관", y(6)).points, 20);
  assert.equal(careerScore("경력 2~4년", y(6)).verdict, "over");
  assert.equal(careerScore("경력7년↑", y(6.2)).verdict, "near");
  assert.equal(careerScore("경력10년↑", y(6)).points, 0);
  assert.equal(careerScore("신입", y(6)).points, 0);
  assert.equal(careerScore("경력3년↑", null).verdict, "unknown");
});

// ── 병합 ─────────────────────────────────────────────────────────

const base = (over: Partial<PositionsFile> = {}): PositionsFile => ({ version: 1, duties: [16], marks: {}, postings: [], ...over });
function run(over: Partial<RunResult> = {}): RunResult {
  return {
    duties: [16],
    listed: [],
    listComplete: true,
    details: new Map(),
    run: { at: "2026-10-20T00:10:00Z", ok: true, listed: 0, fetched: 0 },
    ...over,
  };
}
const item = (gno: number) => ({ gno, company: "A", title: `t${gno}`, career: "경력무관", deadline: "상시" });

test("병합: 첫 수집은 기준선(새 공고 아님), 이후 처음 보는 공고만 새 공고", () => {
  const first = mergeRun(base(), run({ listed: [item(1), item(2)] }));
  assert.ok(first.postings.every((p) => p.baseline));
  const second = mergeRun(first, run({ listed: [item(1), item(2), item(3)], run: { at: "2026-10-21T00:10:00Z", ok: true, listed: 3, fetched: 1 } }));
  const p3 = second.postings.find((p) => p.gno === 3)!;
  assert.equal(p3.baseline, undefined);
  assert.equal(p3.firstSeen, "2026-10-21T00:10:00Z");
  assert.equal(second.postings.find((p) => p.gno === 1)!.firstSeen, "2026-10-20T00:10:00Z");
});

test("병합: 목록을 끝까지 받았을 때만 사라진 공고를 지우고, 그 공고의 표시도 지운다", () => {
  const cur = base({ postings: [{ ...item(1), firstSeen: "x" }, { ...item(2), firstSeen: "x" }], marks: { "2": "star" }, lastRun: { at: "x", ok: true, listed: 2, fetched: 0 } });
  const partial = mergeRun(cur, run({ listed: [item(1)], listComplete: false }));
  assert.deepEqual(partial.postings.map((p) => p.gno).sort(), [1, 2]);
  const full = mergeRun(cur, run({ listed: [item(1)] }));
  assert.deepEqual(full.postings.map((p) => p.gno), [1]);
  assert.deepEqual(full.marks, {});
});

test("병합: 수집 중에 직무가 바뀌었으면 결과를 버린다", () => {
  const cur = base({ duties: [16, 18] });
  const next = mergeRun(cur, run({ duties: [16], listed: [item(1)] }));
  assert.equal(next.postings.length, 0);
  assert.equal(next.lastRun?.ok, true);
});

test("직무: 알려진 코드만, 중복 제거, 최대 6개", () => {
  assert.deepEqual(sanitizeDuties([16, "18", 16, 999, "x"]), [16, 18]);
  assert.equal(sanitizeDuties([1, 2, 3, 9, 12, 15, 16, 18]).length, 6);
});

// ── 수집기(부하 규칙) ───────────────────────────────────────────

function fakeFetch(handler: (url: string, init?: RequestInit) => Response) {
  const calls: { url: string; body?: string }[] = [];
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? String(init.body) : undefined });
    return handler(url, init);
  };
  return { fn, calls };
}

test("수집기: 직무를 묶어 한 번에, 처음 보는 공고만 상세, 요청 사이 간격", async () => {
  const sleeps: number[] = [];
  const { fn, calls } = fakeFetch((url) =>
    url.includes("_GI_Job_List") ? new Response(LIST_HTML) : new Response(DETAIL_HTML),
  );
  const r = await collectGamejob([16, 18], {
    fetch: fn,
    known: new Set([283938]),
    intervalMs: 1500,
    sleep: async (ms) => void sleeps.push(ms),
  });
  assert.equal(r.listComplete, true);
  assert.equal(r.run.ok, true);
  assert.deepEqual(r.listed.map((p) => p.gno), [283938, 283937, 285000]);
  assert.match(decodeURIComponent(calls[0]!.body!), /condition\[duty\]=16,18/);
  // 목록 1번 + 상세 2번(이미 받은 283938 은 건너뜀)
  assert.equal(calls.length, 3);
  assert.deepEqual([...r.details.keys()].sort(), [283937, 285000]);
  assert.equal(sleeps.length, 2); // 첫 요청 뒤 매 요청마다 기다렸다
  assert.ok(sleeps.every((ms) => ms > 1000));
});

test("수집기: 오류 응답을 받으면 그 자리에서 멈춘다(재시도 없음)", async () => {
  let n = 0;
  const { fn, calls } = fakeFetch((url) => {
    if (url.includes("_GI_Job_List")) return new Response(LIST_HTML);
    return ++n === 1 ? new Response(DETAIL_HTML) : new Response("blocked", { status: 403 });
  });
  const r = await collectGamejob([16], { fetch: fn, sleep: async () => {} });
  assert.equal(r.run.ok, false);
  assert.match(r.run.error!, /403/);
  assert.equal(calls.length, 3); // 목록 1 + 상세 성공 1 + 실패 1 — 그 뒤로 더 묻지 않음
  assert.equal(r.details.size, 1);
  assert.equal(r.listComplete, true); // 목록은 다 받았다
});

test("수집기: 요청 상한을 넘기지 않는다", async () => {
  const { fn, calls } = fakeFetch((url) =>
    url.includes("_GI_Job_List") ? new Response(LIST_HTML) : new Response(DETAIL_HTML),
  );
  const r = await collectGamejob([16], { fetch: fn, maxRequests: 2, sleep: async () => {} });
  assert.equal(calls.length, 2);
  assert.equal(r.run.ok, false);
  assert.match(r.run.error!, /상한/);
});

test("수집기: 목록 요청이 실패하면 목록 미완료 — 기존 공고를 지우지 않게", async () => {
  const { fn } = fakeFetch(() => new Response("x", { status: 503 }));
  const r = await collectGamejob([16], { fetch: fn, sleep: async () => {} });
  assert.equal(r.listComplete, false);
  assert.equal(r.listed.length, 0);
});

// ── 저장(원격) ───────────────────────────────────────────────────


function remote() {
  const fake = new FakeGitHub();
  const github = new GitHubStore({ token: "t", repo: "o/r", branch: "main" }, fake.fetch);
  return { fake, github };
}

test("저장: 수집 반영과 ⭐ 표시가 엇갈려도(409) 둘 다 남는다", async () => {
  const { fake, github } = remote();
  const store = new PositionStore(github);
  await store.applyRun(run({ listed: [item(1), item(2)] }));
  await store.setMark(1, "star");
  // 다른 인스턴스(예: 수집 중)가 낡은 sha 로 쓰려다 충돌 → 다시 읽어 합친다.
  fake.injectWriteConflicts(1);
  await new PositionStore(github).applyRun(run({ listed: [item(1), item(2), item(3)], run: { at: "2026-10-21T00:00:00Z", ok: true, listed: 3, fetched: 0 } }));
  const saved = JSON.parse(fake.get(POSITIONS_PATH)!) as PositionsFile;
  assert.equal(saved.marks["1"], "star");
  assert.equal(saved.postings.length, 3);
});

test("저장: 직무를 바꾸면 공고·표시를 비우고, 같은 직무면 쓰지 않는다", async () => {
  const { fake, github } = remote();
  const store = new PositionStore(github);
  await store.applyRun(run({ listed: [item(1)] }));
  await store.setMark(1, "hidden");
  const writes = fake.writes;
  await store.setDuties([16]);
  assert.equal(JSON.parse(fake.get(POSITIONS_PATH)!).postings.length, 1);
  await store.setDuties([16, 18]);
  const saved = JSON.parse(fake.get(POSITIONS_PATH)!) as PositionsFile;
  assert.deepEqual(saved.duties, [16, 18]);
  assert.equal(saved.postings.length, 0);
  assert.deepEqual(saved.marks, {});
  assert.ok(fake.writes > writes);
  await assert.rejects(store.setDuties([]), /하나 이상/);
});

test("저장: 원격 장애면 표시 저장이 실패를 알리고, 없는 공고 표시는 쓰지 않는다", async () => {
  const { fake, github } = remote();
  const store = new PositionStore(github);
  await store.applyRun(run({ listed: [item(1)] }));
  assert.equal(await store.setMark(999, "star"), false);
  fake.injectFailures("transient");
  await assert.rejects(store.setMark(1, "star"), TransientError);
});
