#!/usr/bin/env node
// 로그인 비밀번호의 argon2 해시를 만든다. 출력된 줄을 .env 의 AUTH_PASSWORD_HASH 에 넣는다.
// 비밀번호 자체는 어디에도 저장되지 않는다.
//
//   npm run gen:password      → 비밀번호를 물어보면 입력(화면에 *로 표시)
//
// `!` 등 특수문자가 있어도 안전하다. 프롬프트 입력은 셸을 거치지 않기 때문이다.
import { hash } from "@node-rs/argon2";
import { promptPassword } from "./prompt-password.mjs";

const password = await promptPassword("비밀번호: ");

if (!password || password.length < 8) {
  console.error("비밀번호는 8자 이상이어야 합니다.");
  process.exit(1);
}

const digest = await hash(password);

// argon2 해시는 `$argon2id$v=19$m=...` 처럼 `$`가 많다. .env 파서(Next.js의 @next/env)는
// `$v`·`$m` 등을 변수 참조로 보고 치환해 해시를 망가뜨린다. 그래서 base64로 저장하고
// 앱에서 디코드한다. base64는 .env·셸·에디터 어디서도 특수문자가 없어 안전하다.
const encoded = Buffer.from(digest, "utf8").toString("base64");
console.log(`\n입력한 비밀번호 길이: ${password.length}자`);
console.log("\n.env 에 아래 줄을 넣으세요 (base64, 따옴표 없이 그대로):\n");
console.log(`AUTH_PASSWORD_HASH=${encoded}`);
console.log("\n확인: npm run check:password  (같은 비밀번호로 .env 값과 대조)");
