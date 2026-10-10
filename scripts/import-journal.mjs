// 기존 주간 업무일지(텍스트)를 앱 일지에 백필한다.
// 각 주 [YYYY/MM/DD ~ ...] 블록을 그 주 첫날 09:00-18:00 '업무' 엔트리 1건으로 넣는다.
// 실행:
//   미리보기:  node scripts/import-journal.mjs --dry [--source <path>]
//   실제 넣기: BASE_URL=https://sandbox.seogyoung.com PW=앱비번 node scripts/import-journal.mjs [--source <path>]
// 기본 source: scripts/journal-source.txt
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const si = args.indexOf("--source");
const SOURCE = si >= 0 ? args[si + 1] : "scripts/journal-source.txt";
const { BASE_URL, PW } = process.env;

function parse(text) {
  const lines = text.split(/\r?\n/);
  const headerRe = /^\s*\[(\d{4})\/(\d{2})\/(\d{2})\s*~/; // 주 시작: [YYYY/MM/DD ~ ...]
  const weeks = [];
  let cur = null;
  const end = () => {
    if (cur) weeks.push(cur);
    cur = null;
  };
  for (const line of lines) {
    const m = line.match(headerRe);
    if (m) {
      end();
      cur = { date: `${m[1]}-${m[2]}-${m[3]}`, lines: [] };
      continue;
    }
    // 섹션 구분선(####…)·월 헤더(2026/09 업무일지)·문서 제목은 주 블록 밖
    if (/^\s*#{3,}/.test(line) || /^\s*\d{4}\/\d{2}\s*업무일지\s*$/.test(line) || /^\s*#\s/.test(line)) {
      end();
      continue;
    }
    if (cur) cur.lines.push(line);
  }
  end();

  const entries = [];
  for (const w of weeks) {
    const content = w.lines.join("\n").trim();
    const stripped = content.replace(/[-\s()·*▶]/g, ""); // 불릿·괄호·공백 제거 후 판정
    if (!content || stripped === "기록없음" || stripped === "") continue; // 빈 주 제외
    entries.push({ date: w.date, start: "09:00", end: "18:00", category: "work", tags: [], content });
  }
  return entries;
}

const entries = parse(readFileSync(SOURCE, "utf8"));
console.log(`파싱된 엔트리: ${entries.length}건  (source: ${SOURCE})`);

if (dry) {
  for (const e of entries.slice(0, 3)) {
    console.log(`\n────── ${e.date}  (${e.start}-${e.end}, ${e.category}, ${e.content.length}자)`);
    console.log(
      e.content
        .split("\n")
        .slice(0, 10)
        .join("\n"),
    );
    if (e.content.split("\n").length > 10) console.log("  …");
  }
  console.log("\n[dry-run] 전송하지 않았습니다. 실제로 넣으려면 BASE_URL, PW 와 함께 --dry 없이 실행하세요.");
  process.exit(0);
}

if (!BASE_URL || !PW) {
  console.error("BASE_URL 과 PW 환경변수가 필요합니다.");
  process.exit(1);
}

const login = await fetch(`${BASE_URL}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password: PW }),
});
if (!login.ok) {
  console.error(`로그인 실패: ${login.status}`);
  process.exit(1);
}
const setCookies = login.headers.getSetCookie?.() ?? [login.headers.get("set-cookie")].filter(Boolean);
const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
if (!cookie) {
  console.error("세션 쿠키를 받지 못했습니다.");
  process.exit(1);
}

let ok = 0;
let fail = 0;
for (const e of entries) {
  const res = await fetch(`${BASE_URL}/api/journal/${e.date}/entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ start: e.start, end: e.end, category: e.category, tags: e.tags, content: e.content }),
  });
  if (res.ok) {
    ok++;
    process.stdout.write(".");
  } else {
    fail++;
    console.error(`\n실패 ${e.date}: ${res.status}`);
  }
}
console.log(`\n완료 — 성공 ${ok} · 실패 ${fail} (총 ${entries.length})`);
