// KST(Asia/Seoul) 기준 시각·날짜 유틸. 날짜 경계는 로컬(KST) 기준이어야 한다.
const KST_OFFSET_MIN = 9 * 60;

/** 현재 시각을 KST 기준 ISO8601(+09:00)로. 엔트리 createdAt/updatedAt 에 쓴다. */
export function nowKstIso(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + KST_OFFSET_MIN * 60_000);
  const y = kst.getUTCFullYear();
  const mo = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  const h = String(kst.getUTCHours()).padStart(2, "0");
  const mi = String(kst.getUTCMinutes()).padStart(2, "0");
  const s = String(kst.getUTCSeconds()).padStart(2, "0");
  return `${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`;
}

/** KST 기준 오늘 날짜 "YYYY-MM-DD". */
export function todayKst(now: Date = new Date()): string {
  return nowKstIso(now).slice(0, 10);
}

/** "YYYY-MM-DD" 에 n일을 더한 날짜 문자열. 순수 날짜 연산이라 UTC 로 안전하게 계산. */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** "YYYY-MM-DD" → "10월 2일 (목)" 같은 한국어 표시. */
export function formatKoreanDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][dt.getUTCDay()];
  return `${m}월 ${d}일 (${weekday})`;
}
