// 게임잡(gamejob.co.kr) HTML 파서. 네트워크 없이 문자열만 다룬다(테스트는 고정 샘플로).
// 구조가 바뀌면 여기만 고친다. 못 읽은 칸은 비워 두고, 읽은 것만 돌려준다(전체를 버리지 않는다).

export const GAMEJOB_ORIGIN = "https://www.gamejob.co.kr";

export function postingUrl(gno: number): string {
  return `${GAMEJOB_ORIGIN}/Recruit/GI_Read/View?GI_No=${gno}`;
}

export interface ListItem {
  gno: number;
  company: string;
  title: string;
  /** "경력3년↑" · "신입" · "경력무관" 등 원문 */
  career: string;
  local?: string;
  genre?: string;
  employ?: string;
  /** "상시" · "채용시" · "~11/08" 원문 */
  deadline: string;
  /** "10/08(목) 등록" · "2일 전 등록" 원문 */
  registered?: string;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/** 목록 응답(_GI_Job_List) → 공고들. 같은 공고가 광고 칸에 두 번 나와도 하나로. */
export function parseList(html: string): ListItem[] {
  const out = new Map<number, ListItem>();
  for (const row of html.split(/<tr[\s>]/).slice(1)) {
    const link = row.match(/<div class="tit">\s*<a href="[^"]*GI_No=(\d+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const gno = Number(link[1]);
    if (!Number.isSafeInteger(gno) || out.has(gno)) continue;
    // 제목 <a> 안에는 스크랩 버튼 등이 섞일 수 있어 첫 텍스트만 쓴다.
    const title = text(link[2]!.replace(/<button[\s\S]*?<\/button>/g, ""));
    const company = text(row.match(/<div class="company[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? "");
    const info = [...(row.match(/<p class="info">([\s\S]*?)<\/p>/)?.[1] ?? "").matchAll(/<span>([\s\S]*?)<\/span>/g)].map(
      (m) => text(m[1]!),
    );
    const deadline = text(row.match(/<span class="date">([\s\S]*?)<\/span>/)?.[1] ?? "");
    const registered = text(row.match(/<span class="modifyDate">([\s\S]*?)<\/span>/)?.[1] ?? "") || undefined;
    if (!title) continue;
    out.set(gno, {
      gno,
      company: company || "(회사명 없음)",
      title,
      career: info[0] ?? "",
      // info: 경력 · 학력 · 지역 · 장르 · 고용형태
      local: info[2] || undefined,
      genre: info[3] || undefined,
      employ: info[4] || undefined,
      deadline: deadline || "채용시",
      registered,
    });
  }
  return [...out.values()];
}

/** 목록 전체 건수(탭의 "(1446)"). 없으면 null. */
export function parseTotal(html: string): number | null {
  const m = html.match(/totalJobcnt">\((\d+)\)/);
  return m ? Number(m[1]) : null;
}

// ── 상세 본문 ────────────────────────────────────────────────────

export type SectionKind = "duty" | "req" | "pref" | "etc";

export interface DetailSections {
  /** 본문 글자가 거의 없고 이미지뿐(이미지 공고) */
  imageOnly: boolean;
  sections: Record<SectionKind, string>;
  /** 담당업무 앞 몇 줄(화면 미리보기용) */
  summary: string[];
}

const PREF_RE = /우대|더욱\s*좋|더\s*좋|있으면\s*좋|가산|플러스|nice to have|preferred/i;
const REQ_RE = /자격\s*요건|자격\s*조건|자격\s*사항|지원\s*요건|필요\s*역량|필수\s*역량|지원\s*자격|필수|요구\s*사항|찾습니다|찾고\s*있|이런\s*분|필요해요|requirements|qualifications/i;
const DUTY_RE = /담당\s*업무|주요\s*업무|업무\s*내용|이런\s*업무|하는\s*일|합류하면|responsibilities/i;
const OTHER_RE = /복지|혜택|전형|절차|근무\s*(조건|환경|형태|지|시간)|제출|접수|회사\s*소개|소개합니다|급여|연봉|기타\s*사항|유의\s*사항|문의/;

/** 본문 HTML → 줄 단위 글자. 블록 태그를 줄바꿈으로 본다. */
export function htmlToLines(html: string): string[] {
  const body = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d|dt|dd|table|ul|ol)>/gi, "\n")
    .replace(/<[^>]*>/g, " ");
  return decodeEntities(body)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0 && !/^[✔✓■□●○◆◇▶▷★☆※\-–·•]+$/.test(l));
}

function headerKind(line: string): SectionKind | "other" | null {
  // 제목 줄은 짧다. 긴 문장 속 "우대"는 내용이지 제목이 아니다.
  // 글머리표로 시작하거나("- Unity 경험 필수") 영문 기술명이 든 줄도 내용으로 본다.
  if (/^[\-–·•*]\s|^\d+\.\s/.test(line)) return null;
  const bare = line.replace(/^[\s\[\]【】<>《》()\-–·•■□●○◆◇▶▷★☆✔✓※:#0-9.]+/, "").replace(/[\]】>》):]+$/, "");
  if (bare.length === 0 || bare.length > 30) return null;
  if (/[A-Za-z]/.test(bare) && !/^(requirements|qualifications|responsibilities|preferred|nice to have)/i.test(bare))
    return null;
  if (PREF_RE.test(bare)) return "pref";
  if (DUTY_RE.test(bare)) return "duty";
  if (REQ_RE.test(bare)) return "req";
  if (OTHER_RE.test(bare)) return "other";
  return null;
}

const SECTION_CLIP = 1500;

/** 상세 본문(GI_Read_Comt_Ifrm) → 담당업무·자격요건·우대·기타. 제목을 못 찾으면 전부 기타. */
export function parseDetail(html: string): DetailSections {
  const lines = htmlToLines(html).filter((l) => !/^\/\*|^body[\s,{.]|font-size|line-height/.test(l));
  const sections: Record<SectionKind, string[]> = { duty: [], req: [], pref: [], etc: [] };
  let cur: SectionKind | "other" = "etc";
  for (const l of lines) {
    const h = headerKind(l);
    if (h) {
      cur = h;
      continue;
    }
    if (cur !== "other") sections[cur].push(l);
  }
  const joined = (k: SectionKind) => sections[k].join("\n").slice(0, SECTION_CLIP);
  const textLen = lines.join("").length;
  const imgCount = (html.match(/<img\s/gi) ?? []).length;
  return {
    imageOnly: textLen < 120 && imgCount > 0,
    sections: { duty: joined("duty"), req: joined("req"), pref: joined("pref"), etc: joined("etc") },
    summary: sections.duty
      .map((l) => l.replace(/^[\-–·•*]\s*/, ""))
      .filter((l) => l.length >= 4)
      .slice(0, 3)
      .map((l) => (l.length > 80 ? `${l.slice(0, 79)}…` : l)),
  };
}

// ── 경력·마감·등록일 ─────────────────────────────────────────────

export interface CareerReq {
  /** 신입만 */
  newOnly: boolean;
  /** 무관(신입 가능 포함) */
  any: boolean;
  minYears?: number;
  maxYears?: number;
}

/** "경력3년↑" · "경력 3~7년" · "신입·경력" · "경력무관" · "신입" */
export function parseCareer(raw: string): CareerReq {
  const s = raw.replace(/\s+/g, "");
  if (/무관/.test(s)) return { newOnly: false, any: true };
  const range = s.match(/(\d+)~(\d+)년/);
  if (range) return { newOnly: false, any: false, minYears: Number(range[1]), maxYears: Number(range[2]) };
  const min = s.match(/(\d+)년(?:↑|이상)/);
  if (min) return { newOnly: false, any: false, minYears: Number(min[1]) };
  if (/신입/.test(s) && /경력/.test(s)) return { newOnly: false, any: true };
  if (/신입/.test(s)) return { newOnly: true, any: false };
  if (/경력/.test(s)) return { newOnly: false, any: false, minYears: 1 };
  return { newOnly: false, any: true };
}

export type Deadline = { kind: "date"; date: string } | { kind: "open"; label: string };

/** "~11/08" → 올해(또는 이미 지난 달이면 내년) 날짜. "상시"·"채용시"는 그대로. */
export function parseDeadline(raw: string, today: string): Deadline {
  const m = raw.match(/(\d{1,2})\/(\d{1,2})/);
  if (!m) return { kind: "open", label: raw.trim() || "채용시" };
  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  // 마감은 미래 쪽이다. 지금보다 6개월 넘게 이전 달이면 내년으로 본다.
  const year = mm < tm - 6 ? ty + 1 : ty;
  return { kind: "date", date: `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}` };
}

/** "10/08(목) 등록" → 날짜, "2일 전 등록" → today-2, "오늘 등록" → today. 등록은 과거 쪽. */
export function parseRegistered(raw: string | undefined, today: string): string | undefined {
  if (!raw) return undefined;
  const ago = raw.match(/(\d+)\s*일\s*전/);
  const base = new Date(`${today}T00:00:00Z`);
  if (ago) {
    base.setUTCDate(base.getUTCDate() - Number(ago[1]));
    return base.toISOString().slice(0, 10);
  }
  if (/오늘|시간\s*전|분\s*전/.test(raw)) return today;
  if (/어제/.test(raw)) {
    base.setUTCDate(base.getUTCDate() - 1);
    return base.toISOString().slice(0, 10);
  }
  const m = raw.match(/(\d{1,2})\/(\d{1,2})/);
  if (!m) return undefined;
  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const mm = Number(m[1]);
  const year = mm > tm ? ty - 1 : ty;
  return `${year}-${String(mm).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
}
