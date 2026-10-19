// 기술 사전. 공고 본문과 내 기술을 같은 이름(정식 표기)으로 맞춘다.
// - 내가 "없는" 기술도 잡아야 부족한 항목을 보여줄 수 있으므로, 게임 개발 공고에 흔한 기술을 기본으로 둔다.
// - 내 기술(내 정보·성과 tech)은 실행 시 덧붙인다(사전에 없던 이름도 내 것이면 찾는다).
// 서버·클라이언트 공용 순수 모듈.

interface Entry {
  name: string; // 정식 표기
  /** 추가 표기(대소문자 무시). 한글 별칭 포함. */
  aliases?: string[];
  /** 대소문자를 구분해야 오탐이 없는 짧은 이름(Go 등). */
  exact?: boolean;
}

const BASE: Entry[] = [
  { name: "C++", aliases: ["cpp", "c/c++"] },
  { name: "C#", aliases: ["c sharp", "씨샵"] },
  { name: "Java", aliases: ["자바"] },
  { name: "Kotlin", aliases: ["코틀린"] },
  { name: "Go", aliases: ["golang", "고랭"], exact: true },
  { name: "Rust" },
  { name: "Python", aliases: ["파이썬"] },
  { name: "Node.js", aliases: ["nodejs", "node", "노드"] },
  { name: "TypeScript", aliases: ["타입스크립트"] },
  { name: "JavaScript", aliases: ["자바스크립트"] },
  { name: "Lua", aliases: ["루아"] },
  { name: "Erlang" },
  { name: "Elixir" },
  { name: ".NET", aliases: ["dotnet", "닷넷", ".net core", "net core"] },
  { name: "ASP.NET" },
  { name: "Unity", aliases: ["유니티", "unity3d"] },
  { name: "Unreal", aliases: ["unreal engine", "ue4", "ue5", "언리얼"] },
  { name: "IOCP" },
  { name: "epoll" },
  { name: "TCP", aliases: ["tcp/ip"] },
  { name: "UDP" },
  { name: "WebSocket", aliases: ["웹소켓"] },
  { name: "gRPC" },
  { name: "Protobuf", aliases: ["protocol buffers", "protocol buffer"] },
  { name: "MessagePack" },
  { name: "Photon", aliases: ["포톤"] },
  { name: "MySQL" },
  { name: "MSSQL", aliases: ["sql server", "ms-sql", "ms sql"] },
  { name: "PostgreSQL", aliases: ["postgres"] },
  { name: "Oracle", aliases: ["오라클"] },
  { name: "MongoDB", aliases: ["mongo", "몽고db"] },
  { name: "Redis", aliases: ["레디스"] },
  { name: "Memcached" },
  { name: "DynamoDB" },
  { name: "Elasticsearch", aliases: ["elastic search", "엘라스틱서치"] },
  { name: "Kafka", aliases: ["카프카"] },
  { name: "RabbitMQ" },
  { name: "AWS", aliases: ["amazon web services"] },
  { name: "GCP", aliases: ["google cloud"] },
  { name: "Azure" },
  { name: "Docker", aliases: ["도커"] },
  { name: "Kubernetes", aliases: ["k8s", "쿠버네티스"] },
  { name: "Linux", aliases: ["리눅스", "ubuntu", "centos"] },
  { name: "Nginx" },
  { name: "Jenkins" },
  { name: "Git" },
  { name: "Perforce", aliases: ["p4v"] },
  { name: "Terraform" },
  { name: "Prometheus" },
  { name: "Grafana" },
  { name: "Spring", aliases: ["spring boot", "스프링"] },
  { name: "Django" },
  { name: "Firebase" },
  { name: "DirectX" },
  { name: "OpenGL" },
  { name: "Vulkan" },
  { name: "SQLite" },
];

export interface TechDict {
  /** 정식 표기 → 매칭용 정규식 */
  patterns: { name: string; re: RegExp }[];
  /** 소문자 별칭 → 정식 표기 */
  alias: Map<string, string>;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 영문 표기는 앞뒤가 영숫자·기호에 붙어 있지 않을 때만(“Gonna”·“C#er” 오탐 방지). 한글은 조사가 붙으니 경계 없음. */
function patternFor(term: string, exact: boolean): RegExp {
  const hangul = /[가-힣]/.test(term);
  const body = escape(term);
  if (hangul) return new RegExp(body, exact ? "" : "i");
  return new RegExp(`(?<![A-Za-z0-9+#.])${body}(?![A-Za-z0-9+#])`, exact ? "" : "i");
}

function key(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** "AWS(EC2, ALB)" → ["AWS", "EC2", "ALB"]. 괄호 안은 세부 항목으로 본다. */
export function splitTechLabel(label: string): string[] {
  const m = label.match(/^([^()]+)\(([^)]*)\)\s*$/);
  const parts = m ? [m[1]!, ...m[2]!.split(",")] : [label];
  return parts.map((p) => p.trim()).filter((p) => p.length > 0 && p.length <= 30);
}

/** 기본 사전 + 내 기술. 내 기술 표기가 기본 사전 별칭이면 그 정식 표기로 합친다. */
export function buildDict(extra: string[] = []): TechDict {
  const alias = new Map<string, string>();
  const patterns: TechDict["patterns"] = [];
  for (const e of BASE) {
    alias.set(key(e.name), e.name);
    for (const a of e.aliases ?? []) alias.set(key(a), e.name);
    const terms = [e.name, ...(e.aliases ?? [])];
    // 정식 표기는 exact(대소문자 구분) 설정을 따르고, 별칭은 대소문자 무시.
    const alts = terms.map((t, i) => patternFor(t, i === 0 && Boolean(e.exact)).source);
    patterns.push({ name: e.name, re: new RegExp(alts.map((a) => `(?:${a})`).join("|"), e.exact ? "" : "i") });
  }
  for (const raw of extra) {
    for (const t of splitTechLabel(raw)) {
      if (alias.has(key(t))) continue;
      alias.set(key(t), t);
      patterns.push({ name: t, re: patternFor(t, t.length <= 2) });
    }
  }
  return { patterns, alias };
}

/** 표기를 정식 이름으로. 사전에 없으면 null. */
export function canonical(dict: TechDict, term: string): string | null {
  return dict.alias.get(key(term)) ?? null;
}

/** 글에서 찾은 기술(정식 표기, 처음 나온 순서, 중복 없음). */
export function findTechs(dict: TechDict, text: string): string[] {
  const found: { name: string; at: number }[] = [];
  for (const p of dict.patterns) {
    const m = p.re.exec(text);
    if (m) found.push({ name: p.name, at: m.index });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.name);
}

/** 수집 시 저장해 둘 영문 토큰(사전에 없던 내 기술을 나중에 맞춰 보려고). */
export function latinTokens(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?<![A-Za-z0-9])[A-Za-z][A-Za-z0-9+#.\-]{0,23}(?![A-Za-z0-9])/g)) {
    const t = m[0].replace(/[.\-]+$/, "");
    if (t.length >= 2) out.add(t);
    if (out.size >= 80) break;
  }
  return [...out];
}
