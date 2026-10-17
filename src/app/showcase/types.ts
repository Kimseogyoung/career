// 공개 Showcase가 브라우저로 내보내는 형태. 저장 타입(Achievement·Project)을 그대로 넘기지 않고
// 허용 필드만 골라 담는다 — 저장 타입에 필드가 늘어도 공개로 새지 않게. (ADR-013)

export interface PublicAchievement {
  id: string;
  title: string;
  problem?: string;
  approach?: string;
  result?: string;
  tech: string[];
  theme?: string;
  projectId?: string; // 존재하는 프로젝트일 때만
  star: boolean;
  year: string | null; // 근거 날짜의 연도 라벨("2026" 또는 "2023–2026")
}

export interface PublicProject {
  id: string;
  name: string;
  period?: string;
  description?: string;
}
