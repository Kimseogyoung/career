#!/usr/bin/env node
// 진단용: .env 의 AUTH_PASSWORD_HASH 가 주어진 비밀번호와 맞는지 확인한다.
// 로그인이 안 될 때 "생성/저장이 틀렸나" vs "로그인 입력이 틀렸나" 를 가른다.
//
//   PowerShell:  $env:GEN_PASSWORD='!비밀번호'; npm run check:password
//   bash:        GEN_PASSWORD='!비밀번호' npm run check:password
//
// 앱과 똑같이 @next/env 로 .env 를 읽으므로, .env 파서가 값을 망가뜨리는 문제까지 그대로 재현된다.
import { verify } from "@node-rs/argon2";
// @next/env 는 CommonJS라 named import가 안 된다. default 로 받아 구조분해한다.
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;

const password = process.env.GEN_PASSWORD;
if (!password) {
  console.error(
    "GEN_PASSWORD 환경변수로 비밀번호를 주세요.\n" +
      "  PowerShell:  $env:GEN_PASSWORD='!비밀번호'; npm run check:password\n" +
      "  bash:        GEN_PASSWORD='!비밀번호' npm run check:password",
  );
  process.exit(1);
}

// 앱(src/lib/password.ts)과 동일한 경로로 .env 를 읽는다.
loadEnvConfig(process.cwd());

const encoded = process.env.AUTH_PASSWORD_HASH;
console.log(`입력한 비밀번호 길이: ${password.length}자`);
console.log(`AUTH_PASSWORD_HASH 존재: ${Boolean(encoded)}`);

if (!encoded) {
  console.error("→ .env 에 AUTH_PASSWORD_HASH 가 없습니다. 먼저 npm run gen:password 로 만드세요.");
  process.exit(1);
}

const decoded = Buffer.from(encoded, "base64").toString("utf8");
console.log(`base64 디코드가 '$argon2' 로 시작: ${decoded.startsWith("$argon2")}`);

if (!decoded.startsWith("$argon2")) {
  console.error(
    "→ 저장된 값이 깨졌습니다. gen:password 가 출력한 base64 줄을 따옴표 없이 그대로 넣었는지,\n" +
      "  옛 포맷(argon2 원본)이 남아있지 않은지 확인하세요.",
  );
  process.exit(1);
}

const match = await verify(decoded, password);
console.log(`\n비밀번호 일치: ${match}`);
if (!match) {
  console.error(
    "→ 해시는 정상인데 비밀번호가 다릅니다. 생성할 때와 지금 입력한 비밀번호가 같은지 확인하세요.",
  );
  process.exit(1);
}
console.log("정상입니다. 이 비밀번호로 로그인하면 됩니다. (dev 서버는 .env 변경 후 재시작)");
