#!/usr/bin/env node
// 로그인 비밀번호의 argon2 해시를 만든다. 출력된 줄을 .env 의 AUTH_PASSWORD_HASH 에 넣으면 된다.
// 비밀번호 자체는 어디에도 저장되지 않는다.
import { hash } from "@node-rs/argon2";
import { createInterface } from "node:readline";

function prompt(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // 입력이 화면에 남지 않도록 출력을 막는다.
    const muted = { muted: false };
    rl._writeToOutput = function (chunk) {
      if (!muted.muted) rl.output.write(chunk);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted.muted = true;
  });
}

const password = process.argv[2] ?? (await prompt("비밀번호: "));

if (!password || password.length < 8) {
  console.error("비밀번호는 8자 이상이어야 합니다.");
  process.exit(1);
}

const digest = await hash(password);

// argon2 해시는 `$argon2id$v=19$m=...` 처럼 `$`가 많다. .env 파서(Next.js의 @next/env)는
// `$v`·`$m` 등을 변수 참조로 보고 치환해 해시를 망가뜨린다. 그래서 base64로 저장하고
// 앱에서 디코드한다. base64는 .env·셸·에디터 어디서도 특수문자가 없어 안전하다.
const encoded = Buffer.from(digest, "utf8").toString("base64");
console.log("\n.env 에 아래 줄을 넣으세요 (base64 인코딩됨):\n");
console.log(`AUTH_PASSWORD_HASH=${encoded}`);
