// 연락처 검증. 서버(저장 정리)와 입력 화면이 같이 쓰는 순수 함수.
// 링크는 공개 화면에서 그대로 href 가 되므로 http(s) 만 허용한다 — javascript:·data: 등으로 스크립트가
// 실행되는 걸 막는다(XSS).

export const LINKS_MAX = 6;
export const LINK_LABEL_MAX = 30;
const URL_MAX = 300;
const EMAIL_MAX = 120;

/** http(s) 절대 주소만 정규화해 돌려준다. 그 외(javascript:, data:, 상대 경로 등)는 null. */
export function safeUrl(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v || v.length > URL_MAX) return null;
  // 스킴 없이 "github.com/…" 처럼 적으면 https 로 본다.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function isEmail(raw: string | null | undefined): boolean {
  const v = raw?.trim() ?? "";
  return v.length <= EMAIL_MAX && /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/.test(v);
}

/** 링크 이름이 비면 호스트명으로 대신한다("github.com"). */
export function linkLabel(label: string | undefined, url: string): string {
  const l = label?.trim();
  if (l) return l.slice(0, LINK_LABEL_MAX);
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
