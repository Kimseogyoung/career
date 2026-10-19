// 추천 포지션 화면 DTO(서버에서 점수까지 계산해 넘긴다).
import type { CareerVerdict, Uncertain } from "@/lib/positions/score";
import type { PositionMark, PositionRun } from "@/lib/store/types";

export interface PositionRow {
  gno: number;
  url: string;
  company: string;
  title: string;
  career: string;
  careerVerdict: CareerVerdict;
  meta: string; // 지역 · 장르 · 고용형태
  deadline: { label: string; days?: number; date?: string };
  registered?: string;
  isNew: boolean;
  mark?: PositionMark;
  score: number;
  uncertain: Uncertain;
  matched: { name: string; req: boolean; evidence: number }[];
  missing: { name: string; req: boolean }[];
  evidence: { id: string; title: string }[];
  summary: string[];
}

export interface BoardData {
  duties: number[];
  rows: PositionRow[];
  lastRun: PositionRun | null;
  running: boolean;
}
