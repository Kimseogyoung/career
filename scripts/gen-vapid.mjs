#!/usr/bin/env node
// Web Push 용 VAPID 키쌍을 만든다. 출력된 세 줄을 .env 에 넣으면 된다.
// 공개키는 /api/push/vapid 로 런타임에 내려주고, 비밀키는 서버 전용. 둘 다 빌드에 박지 않는다.
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log("\n.env 에 아래 줄을 넣으세요:\n");
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`VAPID_SUBJECT=mailto:you@example.com   # 본인 메일로 수정`);
