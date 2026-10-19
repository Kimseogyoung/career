// 게임잡 직무 분류(대분류 → 세부 직무 코드). 공고를 올리는 회사가 직접 고르는 값이라
// "직무 일치"는 우리가 추측하지 않고 이 분류로 거른다(ADR-017).
// 게임잡 직종별 화면의 분류를 옮겨 둔 것 — 바뀌면 여기만 고친다. 클라이언트에서도 쓴다.

export interface DutyGroup {
  name: string;
  duties: { code: number; name: string }[];
}

export const DUTY_GROUPS: DutyGroup[] = [
  {
    name: "기술지원",
    duties: [
      { code: 16, name: "서버" },
      { code: 17, name: "네트워크" },
      { code: 18, name: "엔진" },
      { code: 19, name: "시스템·DB" },
      { code: 20, name: "보안" },
      { code: 21, name: "클라우드" },
      { code: 22, name: "결제·PG" },
    ],
  },
  {
    name: "게임제작",
    duties: [
      { code: 1, name: "게임개발(클라이언트)" },
      { code: 2, name: "게임개발(모바일)" },
      { code: 3, name: "게임AI 개발" },
      { code: 9, name: "게임기획" },
    ],
  },
  {
    name: "플랫폼 제작",
    duties: [
      { code: 12, name: "플랫폼 개발" },
      { code: 15, name: "플랫폼 기획" },
    ],
  },
  {
    name: "사업기획",
    duties: [{ code: 30, name: "정보·빅데이터 분석" }],
  },
];

const BY_CODE = new Map(DUTY_GROUPS.flatMap((g) => g.duties.map((d) => [d.code, d.name] as const)));

export const DUTY_MAX = 6;

export function dutyName(code: number): string {
  return BY_CODE.get(code) ?? `직무 ${code}`;
}

/** 알려진 코드만, 중복 없이, 최대 DUTY_MAX 개. */
export function sanitizeDuties(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const x of v) {
    const n = typeof x === "number" ? x : Number(x);
    if (BY_CODE.has(n) && !out.includes(n)) out.push(n);
    if (out.length >= DUTY_MAX) break;
  }
  return out;
}
