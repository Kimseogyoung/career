import "server-only";
import { verify } from "@node-rs/argon2";

/**
 * 단일 사용자이므로 사용자 테이블이 없다. 비밀번호 해시는 환경변수에만 존재한다.
 * 해시 생성은 `npm run gen:password`.
 *
 * AUTH_PASSWORD_HASH 는 argon2 해시를 base64로 인코딩한 값이다. argon2 원본은
 * `$`가 많아 .env 파서(@next/env)가 변수로 치환해 망가뜨리기 때문이다. 여기서 디코드한다.
 */
export async function verifyPassword(plain: string): Promise<boolean> {
  const encoded = process.env.AUTH_PASSWORD_HASH;
  if (!encoded) {
    throw new Error(
      "AUTH_PASSWORD_HASH가 설정되지 않았습니다. `npm run gen:password`로 생성해 .env에 넣으세요.",
    );
  }
  const hash = Buffer.from(encoded, "base64").toString("utf8");
  if (!hash.startsWith("$argon2")) {
    // base64가 아닌 argon2 원본을 그대로 넣으면 .env 파서가 $를 치환해 깨진 값이 들어온다.
    // 설정 실수를 인증 실패와 구분해 로그로 드러낸다.
    throw new Error(
      "AUTH_PASSWORD_HASH 가 올바른 형식이 아닙니다. `npm run gen:password` 가 출력한 base64 값을 그대로 넣었는지 확인하세요.",
    );
  }
  try {
    return await verify(hash, plain);
  } catch {
    // 해시 포맷이 깨진 경우. 잘못된 비밀번호와 구분하지 않고 실패로 처리한다.
    return false;
  }
}
