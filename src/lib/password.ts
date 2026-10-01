import "server-only";
import { verify } from "@node-rs/argon2";

/**
 * 단일 사용자이므로 사용자 테이블이 없다. 비밀번호 해시는 환경변수에만 존재한다.
 * 해시 생성은 `npm run gen:password`.
 */
export async function verifyPassword(plain: string): Promise<boolean> {
  const hash = process.env.AUTH_PASSWORD_HASH;
  if (!hash) {
    throw new Error(
      "AUTH_PASSWORD_HASH가 설정되지 않았습니다. `npm run gen:password`로 생성해 .env에 넣으세요.",
    );
  }
  try {
    return await verify(hash, plain);
  } catch {
    // 해시 포맷이 깨진 경우. 잘못된 비밀번호와 구분하지 않고 실패로 처리한다.
    return false;
  }
}
