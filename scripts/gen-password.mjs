#!/usr/bin/env node
// 로그인 비밀번호의 argon2 해시를 만든다. 출력된 줄을 .env 의 AUTH_PASSWORD_HASH 에 넣는다.
// 비밀번호 자체는 어디에도 저장되지 않는다.
//
// 입력 방법 (권장 순서):
//   1) 환경변수 — 셸·터미널이 입력을 건드리지 않아 가장 안전하다.
//        PowerShell:  $env:GEN_PASSWORD='!비밀번호'; npm run gen:password   (작은따옴표 필수)
//        bash:        GEN_PASSWORD='!비밀번호' npm run gen:password
//   2) 프롬프트 — 그냥 `npm run gen:password` 실행 후 입력(화면에 안 보임).
//      일부 Windows 터미널에서 가림 입력이 불안정하면 1)을 쓸 것.
import { hash } from "@node-rs/argon2";
import { createInterface } from "node:readline";

function prompt(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
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

// 우선순위: GEN_PASSWORD 환경변수 > 프롬프트. (인자로 받지 않는다 — 셸 히스토리 확장이
// bash/zsh 에서 `!` 를 먹어 비밀번호가 조용히 바뀌는 사고를 막기 위해서다.)
const password = process.env.GEN_PASSWORD ?? (await prompt("비밀번호: "));

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
