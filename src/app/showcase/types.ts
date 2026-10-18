// 공개 Showcase가 브라우저로 내보내는 형태. 저장 타입(Achievement·Project·Profile)을 그대로 넘기지 않고
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

/** 기간 한쪽 끝의 표시용 값. date 는 "2024.05" 형태. */
export interface PublicMark {
  date?: string;
  note?: string;
}

export interface PublicPhoto {
  id: string;
  width: number;
  height: number;
  caption?: string;
}

export interface PublicProject {
  id: string;
  name: string;
  org?: string; // 소속 회사(직접 고른 것 또는 기간으로 추정)
  description?: string;
  start?: PublicMark;
  end?: PublicMark & { ongoing?: boolean };
  legacyPeriod?: string; // 날짜로 옮기지 못한 예전 글자
  photos: PublicPhoto[];
  achievementCount: number;
}

export interface PublicCareer {
  id: string;
  org?: string;
  role?: string;
  start?: string; // "2024.01"
  end?: string; // "2023.12" (재직 중이면 없음)
  current: boolean;
  duration?: string; // "2년 10개월"
  legacyPeriod?: string;
  note?: string;
}

export interface PublicProfile {
  name?: string;
  headline?: string;
  /** 이메일은 원문 대신 base64 로만 내보낸다 — HTML 을 긁는 단순 수집기 회피. "복사" 를 눌러야 풀린다. */
  emailEncoded?: string;
  links: { label: string; url: string }[];
  intro?: string;
  techStack: { label: string; items: string[] }[];
  career: PublicCareer[];
  totalCareer?: string; // 겹침 없이 합친 총 경력
}

/** "2023.01 합류 – 2024.05 출시" / "2025.03 – 개발 중". 날짜가 없으면 예전 글자. */
export function projectPeriodLabel(p: Pick<PublicProject, "start" | "end" | "legacyPeriod">): string | undefined {
  if (!p.start?.date) return p.legacyPeriod;
  const start = [p.start.date, p.start.note].filter(Boolean).join(" ");
  if (!p.end) return start;
  const end = p.end.ongoing
    ? p.end.note || "진행 중"
    : [p.end.date, p.end.note].filter(Boolean).join(" ");
  return end ? `${start} – ${end}` : start;
}

export function mediaUrl(projectId: string, photoId: string): string {
  return `/showcase/media/${projectId}/${photoId}`;
}
