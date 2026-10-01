// ULID 생성기. 엔트리 id 로 쓴다. 생성 시각이 앞부분에 들어가 문자열 정렬 = 시간 정렬.
// 외부 의존성을 늘리지 않으려 직접 구현한다(단일 사용자라 충돌 걱정 없음).
import { randomBytes } from "node:crypto";

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32
const ENCODING_LEN = ENCODING.length;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function encodeTime(now: number): string {
  let out = "";
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    const mod = now % ENCODING_LEN;
    out = ENCODING[mod] + out;
    now = (now - mod) / ENCODING_LEN;
  }
  return out;
}

function encodeRandom(): string {
  const bytes = randomBytes(RANDOM_LEN);
  let out = "";
  for (let i = 0; i < RANDOM_LEN; i++) {
    out += ENCODING[bytes[i]! % ENCODING_LEN];
  }
  return out;
}

export function ulid(now: number = Date.now()): string {
  return encodeTime(now) + encodeRandom();
}
