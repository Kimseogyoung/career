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
console.log("\n.env 에 아래 줄을 넣으세요:\n");
console.log(`AUTH_PASSWORD_HASH=${digest}`);
