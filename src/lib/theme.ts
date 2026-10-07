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

// 하이드레이션 전에 <head> 에서 실행돼 FOUC(테마 깜빡임)를 막는 인라인 스크립트.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;
