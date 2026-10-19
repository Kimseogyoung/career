// 테마 전환. 값은 "system" | "light" | "dark". 기기별 localStorage 에 저장(테마는 기기 취향).
// system 이면 data-theme 속성을 비워 OS(prefers-color-scheme)를 따른다.

export type Theme = "system" | "light" | "dark";
export const THEME_KEY = "career-theme";

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* 접근 불가(프라이빗 모드 등) → system */
  }
  return "system";
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* 무시 */
  }
}

// ── 테마(ADR-018). 어떤 테마를 쓸지는 모드처럼 기기별(localStorage). ───────────
// 테마는 자기 팔레트를 함께 건다(data-tid + data-palette). 공개 Showcase 는 기기 선택과 무관하게
// 설정의 공개 테마("showcase" 선택자)를 쓴다 — 방문자에게 보이는 그대로.

export const THEME_ID_KEY = "career-theme-id";

export function readThemeId(): string {
  try {
    return localStorage.getItem(THEME_ID_KEY) || "default";
  } catch {
    return "default";
  }
}

export function saveThemeId(id: string): void {
  try {
    if (id === "default") localStorage.removeItem(THEME_ID_KEY);
    else localStorage.setItem(THEME_ID_KEY, id);
  } catch {
    /* 무시 */
  }
}

function setAttr(name: string, v: string | null): void {
  const root = document.documentElement;
  if (!v || v === "default") root.removeAttribute(name);
  else root.setAttribute(name, v);
}

/** 테마 적용. paletteOf 에 없는 id(지워진 테마 등)면 기본 테마. */
export function applyThemeId(id: string, paletteOf: Record<string, string>): void {
  const tid = paletteOf[id] ? id : "default";
  setAttr("data-tid", tid);
  setAttr("data-palette", paletteOf[tid] ?? "default");
}

/** 미리보기 등에서 팔레트만 따로 건다. */
export function applyPalette(id: string): void {
  setAttr("data-palette", id);
}

export function applyScope(showcase: boolean): void {
  setAttr("data-scope", showcase ? "showcase" : null);
}

/**
 * 하이드레이션 전에 <head> 에서 실행돼 FOUC(테마 깜빡임)를 막는 인라인 스크립트.
 * paletteOf 는 서버가 검증한 id(소문자·숫자·하이픈)만 담는다.
 */
export function themeInitScript(paletteOf: Record<string, string>): string {
  const map = JSON.stringify(paletteOf).replace(/</g, "\\u003c");
  return `(function(){var d=document.documentElement,ls=null,m=${map};try{ls=localStorage;}catch(e){}
try{var t=ls&&ls.getItem("${THEME_KEY}");if(t==="light"||t==="dark")d.setAttribute("data-theme",t);}catch(e){}
var path=location.pathname,sc=path==="/showcase"||path.indexOf("/showcase/")===0,id=null;
try{id=sc?"showcase":(ls&&ls.getItem("${THEME_ID_KEY}"));}catch(e){}
if(!id||!m[id])id="default";
if(sc)d.setAttribute("data-scope","showcase");
if(id!=="default")d.setAttribute("data-tid",id);
if(m[id]&&m[id]!=="default")d.setAttribute("data-palette",m[id]);})();`;
}
