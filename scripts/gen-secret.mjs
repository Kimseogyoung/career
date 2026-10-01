#!/usr/bin/env node
// 세션 쿠키 서명용 비밀키를 만든다.
import { randomBytes } from "node:crypto";

console.log("\n.env 에 아래 줄을 넣으세요:\n");
console.log(`SESSION_SECRET=${randomBytes(48).toString("base64")}`);
