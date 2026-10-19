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

// ── 팔레트(ADR-018). 어떤 팔레트를 쓸지는 모드처럼 기기별(localStorage). ───────────
// 공개 Showcase 는 기기 선택과 무관하게 설정의 공개 팔레트를 쓴다(방문자에게 보이는 그대로).

export const PALETTE_KEY = "career-palette";

export function readPalette(): string {
  try {
    return localStorage.getItem(PALETTE_KEY) || "default";
  } catch {
    return "default";
  }
}

export function savePalette(id: string): void {
  try {
    if (id === "default") localStorage.removeItem(PALETTE_KEY);
    else localStorage.setItem(PALETTE_KEY, id);
  } catch {
    /* 무시 */
  }
}

export function applyPalette(id: string): void {
  const root = document.documentElement;
  if (!id || id === "default") root.removeAttribute("data-palette");
  else root.setAttribute("data-palette", id);
}

/**
 * 하이드레이션 전에 <head> 에서 실행돼 FOUC(테마 깜빡임)를 막는 인라인 스크립트.
 * showcasePalette 는 서버가 검증한 id(resolvePaletteId)만 넣는다.
 */
export function themeInitScript(showcasePalette: string): string {
  const sc = JSON.stringify(showcasePalette);
  return `(function(){var d=document.documentElement,ls=null;try{ls=localStorage;}catch(e){}
try{var t=ls&&ls.getItem("${THEME_KEY}");if(t==="light"||t==="dark")d.setAttribute("data-theme",t);}catch(e){}
var path=location.pathname,sc=path==="/showcase"||path.indexOf("/showcase/")===0,p=null;
try{p=sc?${sc}:(ls&&ls.getItem("${PALETTE_KEY}"));}catch(e){}
if(p&&p!=="default")d.setAttribute("data-palette",p);})();`;
}
