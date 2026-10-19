// 추천 포지션 적합도(ADR-017). 규칙 기반 순수 함수 — AI·네트워크 없음.
//   기술 일치 60 + 경력 조건 25 + 근거 깊이 15 = 100
// 배점을 바꾸려면 여기 상수만 고친다(score.test.ts 가 기준을 고정).

import { totalMonths, type YearMonth } from "@/lib/period";
import type { Achievement, Position, PositionTerms, Profile } from "@/lib/store/types";
import { buildDict, canonical, splitTechLabel, type TechDict } from "./tech-dict";
import { parseCareer } from "./gamejob";

export const W_TECH = 60;
export const W_CAREER = 25;
export const W_DEPTH = 15;
/** 기술을 판단할 수 없을 때(이미지 공고·상세 미수집·기술 언급 없음) 주는 중간값. */
const TECH_UNKNOWN = W_TECH / 2;
/** 공고에서 찾은 기술 가중치 합이 이보다 작으면 기술 점수를 중간값 쪽으로 당긴다.
 *  기술이 1~2개뿐인 공고가 "다 맞음"으로 만점이 되는 것을 막는다(근거가 적으면 확신도 적게). */
const FULL_CONFIDENCE_WEIGHT = 5;
/** 지원 자체가 어려운 공고(신입 전용·요구 경력에 1년 넘게 모자람)는 기술이 맞아도 이 점수를 넘지 않는다. */
export const INELIGIBLE_CAP = 49;

const SECTION_WEIGHT: Record<keyof PositionTerms, number> = { req: 2, pref: 1, duty: 1, etc: 1 };
const SECTION_RANK: (keyof PositionTerms)[] = ["req", "pref", "duty", "etc"];

export interface Evidence {
  id: string;
  title: string;
  star: boolean;
  key: string; // 최신순 정렬 키
}

export interface Me {
  dict: TechDict;
  /** 정식 기술 이름 → 근거 성과(없으면 기술 스택에만 있음) */
  have: Map<string, Evidence[]>;
  careerMonths: number | null;
}

function recentKey(a: Achievement): string {
  const latest = (a.sourceDates ?? []).reduce((m, d) => (d > m ? d : m), "");
  return latest || (a.createdAt ?? "").slice(0, 10);
}

/** 내 기술(내 정보 기술 스택 + 성과 tech)과 총 경력. 숨긴 성과는 근거로 쓰지 않는다. */
export function buildMe(profile: Profile, achievements: Achievement[], now: YearMonth): Me {
  const stack = profile.techStack.flatMap((g) => g.items);
  const visible = achievements.filter((a) => !a.hidden);
  const dict = buildDict([...stack, ...visible.flatMap((a) => a.tech)]);
  const have = new Map<string, Evidence[]>();
  const norm = (t: string) => splitTechLabel(t).map((x) => canonical(dict, x) ?? x);
  for (const s of stack) for (const n of norm(s)) if (!have.has(n)) have.set(n, []);
  for (const a of visible) {
    const ev: Evidence = { id: a.id, title: a.title, star: a.star, key: recentKey(a) };
    for (const n of new Set(a.tech.flatMap(norm))) {
      const list = have.get(n) ?? [];
      list.push(ev);
      have.set(n, list);
    }
  }
  const ranges = profile.career
    .filter((c) => c.start && (c.current || c.end))
    .map((c) => ({ start: c.start!, end: c.current ? now : c.end! }));
  const months = totalMonths(ranges);
  return { dict, have, careerMonths: ranges.length ? months : null };
}

export type CareerVerdict = "ok" | "any" | "over" | "near" | "under" | "newOnly" | "unknown";
export type Uncertain = "image" | "noDetail" | "noTech" | null;

export interface TechHit {
  name: string;
  section: keyof PositionTerms;
  evidence: number;
}

export interface Scored {
  score: number;
  uncertain: Uncertain;
  matched: TechHit[];
  missing: { name: string; section: keyof PositionTerms }[];
  career: CareerVerdict;
  evidence: { id: string; title: string }[];
}

/** 공고 기술: 구역별로 사전에 있는 이름만, 한 기술은 가장 무거운 구역 하나로. */
export function postingTechs(terms: PositionTerms, dict: TechDict): { name: string; section: keyof PositionTerms }[] {
  const sectioned = terms.req.length + terms.pref.length + terms.duty.length > 0;
  const out = new Map<string, keyof PositionTerms>();
  for (const sec of SECTION_RANK) {
    // 제목을 하나도 못 찾은 공고만 '기타'를 쓴다(회사 소개 속 기술까지 세지 않으려고).
    if (sec === "etc" && sectioned) continue;
    for (const t of terms[sec]) {
      const name = canonical(dict, t);
      if (name && !out.has(name)) out.set(name, sec);
    }
  }
  return [...out].map(([name, section]) => ({ name, section }));
}

export function careerScore(raw: string, months: number | null): { verdict: CareerVerdict; points: number } {
  const req = parseCareer(raw);
  if (req.any) return { verdict: "any", points: 20 };
  if (months === null) return { verdict: "unknown", points: 12 };
  const years = months / 12;
  if (req.newOnly) return { verdict: "newOnly", points: years < 1 ? W_CAREER : 0 };
  const min = req.minYears ?? 0;
  if (req.maxYears !== undefined && years >= req.maxYears + 1) return { verdict: "over", points: 15 };
  if (years >= min) return { verdict: "ok", points: W_CAREER };
  if (min - years <= 1) return { verdict: "near", points: 10 };
  return { verdict: "under", points: 0 };
}

export function scorePosting(p: Position, me: Me): Scored {
  const career = careerScore(p.career, me.careerMonths);

  let uncertain: Uncertain = null;
  let techPts = TECH_UNKNOWN;
  let depthPts = 0;
  const matched: TechHit[] = [];
  const missing: Scored["missing"] = [];

  if (!p.detail) uncertain = "noDetail";
  else if (p.detail.imageOnly) uncertain = "image";
  else {
    const techs = postingTechs(p.detail.terms, me.dict);
    if (!techs.length) uncertain = "noTech";
    let total = 0;
    let got = 0;
    let depth = 0;
    for (const t of techs) {
      const w = SECTION_WEIGHT[t.section];
      total += w;
      const ev = me.have.get(t.name);
      if (ev) {
        got += w;
        matched.push({ name: t.name, section: t.section, evidence: ev.length });
        // 성과로 증명된 기술일수록 깊다. ⭐ 성과가 있으면 만점.
        depth += w * (ev.some((e) => e.star) ? 1 : ev.length ? 0.7 : 0);
      } else missing.push(t);
    }
    if (total) {
      const raw = (W_TECH * got) / total;
      techPts = TECH_UNKNOWN + (raw - TECH_UNKNOWN) * Math.min(1, total / FULL_CONFIDENCE_WEIGHT);
      depthPts = got ? (W_DEPTH * depth) / got : 0;
    }
  }

  // 근거 성과: 필수에서 맞은 기술부터, ⭐ → 최신 순으로 3개.
  const seen = new Set<string>();
  const evidence: Scored["evidence"] = [];
  const order = [...matched].sort((a, b) => SECTION_RANK.indexOf(a.section) - SECTION_RANK.indexOf(b.section));
  const pool = order.flatMap((m) =>
    [...(me.have.get(m.name) ?? [])].sort((x, y) => Number(y.star) - Number(x.star) || y.key.localeCompare(x.key)),
  );
  for (const e of pool) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    evidence.push({ id: e.id, title: e.title });
    if (evidence.length >= 3) break;
  }

  const total = Math.round(techPts + career.points + depthPts);
  const ineligible = career.verdict === "newOnly" || career.verdict === "under";
  return {
    score: ineligible ? Math.min(total, INELIGIBLE_CAP) : total,
    uncertain,
    matched,
    missing,
    career: career.verdict,
    evidence,
  };
}
