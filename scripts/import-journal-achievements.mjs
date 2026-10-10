// journal-source.txt 의 "▶ 문제 해결 경험" 블록을 원문 그대로 성과(STAR)로 넣는다.
// AI 추출본이 너무 요약돼 디테일이 깎인 걸 보강하는 용도. 근거 날짜는 그 주(월) → 일지로 링크됨.
// 실행:
//   미리보기:  node scripts/import-journal-achievements.mjs --dry [--source <path>]
//   실제 넣기: BASE_URL=https://career.sandbox.seogyoung.com PW=앱비번 node scripts/import-journal-achievements.mjs
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const si = args.indexOf("--source");
const SOURCE = si >= 0 ? args[si + 1] : "scripts/journal-source.txt";

const TECHS = [
  "Redis", "MySQL", "Nginx", "Lambda", "TeamCity", "CodeDeploy", "AES", "MessagePack", "LZ4",
  "Prometheus", "Grafana", "Sentry", "Athena", "Iceberg", "Jupyter", "Photon", "Unity", "MongoDB",
  "NodeJS", "Docker", "Linux", "TCP_INFO", "OpenTelemetry", "FrozenDictionary", "NLog",
  "Terminal.Gui", "NuGet", "dotnet-trace", "dotnet-dump", "speedscope", "SOS", "Name Lock",
  "SortedSet", "ProtoBuf", "Dapper", "StackExchange.Redis", "ConcurrentDictionary", "C#", "Python",
  "AWS", "EC2", "AutoScaling", "S3", "ALB", "WSAIoctl", "getsockopt", "PromQL", "PowerShell",
  "NetMQ", "CsvHelper", "ZString", "SqlClient", "Copy-on-Write", "Guid",
];

function parse(text) {
  const lines = text.split(/\r?\n/);
  const weekRe = /^\s*\[(\d{4})\/(\d{2})\/(\d{2})\s*~/;
  const startRe = /▶\s*문제\s*해결\s*경험\s*:?\s*(.*)$/;
  let week = null;
  const blocks = [];
  let cur = null;
  const flush = () => {
    if (cur) blocks.push(cur);
    cur = null;
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const wm = line.match(weekRe);
    if (wm) {
      flush();
      week = `${wm[1]}-${wm[2]}-${wm[3]}`;
      continue;
    }
    const sm = line.match(startRe);
    if (sm) {
      flush();
      cur = { week, head: sm[1].trim(), bullets: [] };
      continue;
    }
    if (cur) {
      const t = line.trim();
      if (t.startsWith("·")) cur.bullets.push(t.replace(/^·\s*/, ""));
      else if (t === "") {
        /* 블록 내 빈 줄 허용 안 함 — 공백이면 블록 종료 후보지만 다음 · 가 이어질 수 있어 무시 */
      } else {
        // · 로 시작하지 않는 일반 줄이 나오면 블록 종료
        flush();
      }
    }
  }
  flush();

  const out = [];
  for (const b of blocks) {
    if (!b.bullets.length) continue;
    const m = b.head.match(/^\[(.+?)\]\s*(.*)$/);
    const theme = m ? m[1].trim() : undefined;
    const title = (m ? m[2] : b.head).trim() || b.head;

    const kv = b.bullets.map((s) => {
      const i = s.indexOf(":");
      return i >= 0 ? [s.slice(0, i).trim(), s.slice(i + 1).trim()] : [null, s.trim()];
    });
    // 문제 라벨은 카드에 이미 있으니, 키가 그냥 "문제"면 값만 둔다(문제 1/문제 2 등은 라벨 유지).
    const problemBits = kv
      .filter(([k]) => k && /문제|상황/.test(k))
      .map(([k, v]) => (k === "문제" ? v : `${k}: ${v}`));
    const resultBits = kv.filter(([k]) => k && /배운\s*점/.test(k)).map(([, v]) => v);
    const approachBits = kv
      .filter(([k, v]) => (k ? !/문제|상황|배운\s*점/.test(k) : true) && v)
      .map(([k, v]) => (k ? `${k}: ${v}` : v));

    const full = b.bullets.join(" ");
    const tech = TECHS.filter((t) => full.toLowerCase().includes(t.toLowerCase()));

    out.push({
      title,
      problem: problemBits.join("\n") || undefined,
      approach: approachBits.join("\n") || undefined,
      result: resultBits.join("\n") || undefined,
      tech,
      theme,
      sourceDates: b.week ? [b.week] : [],
      createdBy: "manual",
    });
  }
  return out;
}

const items = parse(readFileSync(SOURCE, "utf8"));
console.log(`파싱된 성과: ${items.length}건 (source: ${SOURCE})`);

if (dry) {
  for (const a of items) {
    console.log(
      `\n── [${a.theme ?? "-"}] ${a.title}  (${a.sourceDates[0] ?? "?"})  기술:${a.tech.join(",") || "-"}`,
    );
    if (a.problem) console.log("  문제: " + a.problem.replace(/\n/g, " / ").slice(0, 90));
    if (a.result) console.log("  배운점: " + a.result.replace(/\n/g, " / ").slice(0, 90));
  }
  console.log("\n[dry-run] 전송 안 함.");
  process.exit(0);
}

const { BASE_URL, PW } = process.env;
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

const res = await fetch(`${BASE_URL}/api/achievements`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ items }),
});
if (!res.ok) {
  console.error(`저장 실패: ${res.status}`);
  process.exit(1);
}
const body = await res.json();
console.log(`완료 — 저장 ${body.saved?.length ?? 0}건`);
