# 데이터 모델

## 1. 원격 레포 레이아웃

기록의 정본. private GitHub 레포 하나를 통째로 데이터 저장소로 쓴다. (코드 레포와 **분리된** 별도 레포)

```
<backup-repo>/
├─ index.json                     # 달력 렌더용 경량 인덱스 (단일 파일)
├─ settings.json                  # 사용자 설정 + 푸시 구독
├─ journal/
│  └─ 2026/
│     ├─ 2026-09.json             # 월 1파일 — 그 달의 모든 엔트리 + 일간 요약
│     └─ 2026-10.json
├─ summaries/
│  ├─ weekly/
│  │  └─ 2026-W40.json
│  └─ monthly/
│     └─ 2026-10.json
├─ snapshots/                     # 월 1회 tar.gz (2차 사본)
│  └─ 2026-10-01.tar.gz
└─ career/                        # 2단계. MVP에서는 생성하지 않음
   ├─ applications/
   └─ resumes/
```

**왜 이 모양인가**: 네트워크가 정본이므로 요청 수를 최소화해야 한다. 달력은 `index.json` 1회, 월 상세는 월 파일 1회로 끝난다. (근거: [ARCHITECTURE.md §3.4](./ARCHITECTURE.md))

---

## 2. 스키마

### 2.1 `journal/<YYYY>/<YYYY-MM>.json`

```jsonc
{
  "month": "2026-10",
  "version": 1,
  "days": {
    "2026-10-01": {
      "entries": [
        {
          "id": "01JA8Z...",            // ULID. 시간순 정렬 가능
          "start": "09:00",             // KST, 슬롯 시작
          "end": "10:00",
          "category": "work",           // work | study | meeting | side | etc
          "tags": ["career-log", "nextjs"],
          "content": "달력 월 뷰 컴포넌트 작성. 주간 요약 노출 위치 결정.",
          "createdAt": "2026-10-01T10:02:11+09:00",
          "updatedAt": "2026-10-01T10:02:11+09:00"
        }
      ],
      "summary": {
        "text": "Next.js 달력 뷰 골격을 세우고…",
        "generatedBy": "ai",            // ai | manual
        "model": "claude-opus-5",
        "generatedAt": "2026-10-01T23:50:03+09:00",
        "editedAt": null,               // 사람이 고쳤으면 그 시각
        "status": "ok"                  // ok | failed | pending
      }
    }
  }
}
```

- 날짜 키는 `YYYY-MM-DD`. 기록 없는 날은 키 자체가 없다.
- `entries`는 `start` 오름차순으로 유지한다.
- 한 슬롯에 여러 엔트리가 들어갈 수 있다(회의 30분 + 작업 30분 같은 경우). UI는 1슬롯 1엔트리를 기본으로 안내하되 모델이 막지 않는다.

### 2.2 `index.json` — 달력 전용 경량 인덱스

```jsonc
{
  "version": 1,
  "updatedAt": "2026-10-01T23:50:05+09:00",
  "days": {
    "2026-10-01": {
      "head": "Next.js 달력 뷰 골격을 세우고 주간 요약 노출 위치를 결정",  // 최대 80자
      "count": 6,                        // 엔트리 수
      "categories": ["work", "study"],   // 셀 색 표시용
      "hasSummary": true
    }
  },
  "weeks": {
    "2026-W40": { "head": "인증 모듈을 세션 기반으로 재작성하고…", "hasSummary": true }
  },
  "months": {
    "2026-10": { "hasSummary": true, "totalHours": 142 }
  }
}
```

- **월 파일을 읽지 않고도 달력 전체가 렌더된다.** 일 셀의 `…` 생략 텍스트가 `head`다.
- 월 파일을 쓸 때마다 함께 갱신한다(한 번의 디바운스 플러시에서 2개 파일 커밋).
- 1년치가 쌓여도 ~100KB. 전량을 메모리에 상주시킨다.

### 2.3 `summaries/weekly/<YYYY>-W<WW>.json`

```jsonc
{
  "week": "2026-W40",
  "range": { "from": "2026-09-28", "to": "2026-10-04" },
  "text": "…",
  "generatedBy": "ai",
  "model": "claude-opus-5",
  "generatedAt": "2026-10-04T23:55:00+09:00",
  "editedAt": null,
  "status": "ok",
  "stats": {
    "totalHours": 38,
    "byCategory": { "work": 30, "study": 6, "meeting": 2 },
    "topTags": [{ "tag": "career-log", "hours": 12 }]
  }
}
```

`summaries/monthly/<YYYY-MM>.json`도 같은 모양(`month`, `range`가 그 달 전체).

### 2.4 `settings.json`

```jsonc
{
  "version": 1,
  "timezone": "Asia/Seoul",
  "recordingHours": { "start": "09:00", "end": "18:00" },
  "reminder": {
    "enabled": true,
    "days": [1, 2, 3, 4, 5],          // 0=일 … 6=토
    "hours": { "start": "09:00", "end": "18:00" },
    "skipIfRecorded": true
  },
  "categories": [
    { "id": "work",    "label": "업무",  "color": "#2563eb" },
    { "id": "study",   "label": "공부",  "color": "#16a34a" },
    { "id": "meeting", "label": "회의",  "color": "#d97706" },
    { "id": "side",    "label": "사이드","color": "#9333ea" },
    { "id": "etc",     "label": "기타",  "color": "#64748b" }
  ],
  "pushSubscriptions": [
    { "id": "…", "label": "회사 PC", "endpoint": "…", "keys": { "p256dh": "…", "auth": "…" }, "createdAt": "…" }
  ],
  "summaryPrompts": {                   // 선택. AI 요약 프롬프트 커스텀(비면 코드 기본값 폴백)
    "system": "…",                      // 시스템 프롬프트
    "day": "…", "week": "…", "month": "…" // 범위별 지침
  }
}
```

- `summaryPrompts`·`achievementPrompts` 는 선택 필드다. 비거나 없으면 `src/lib/summary/prompts.ts` 기본값. 설정 화면에서 편집한다. 단 성과 추출의 **JSON 출력 형식은 코드 고정**(파싱 때문)이라, 편집 가능한 건 `achievementPrompts.system`(성격·규칙)·`guide`(추가 지침)뿐이다.
- 요약 모델은 설정이 아니라 서버 env `ANTHROPIC_MODEL`(기본 `claude-opus-5-5`)로 정한다.

### 2.5 `meta/achievements.json` (커리어 · 성과 모음)

기록(`journal/`)과 섞지 않도록 `meta/` 아래 둔다(ADR-012). 기록이 아니라 기록에서 뽑은 커리어 메타데이터.

```jsonc
{
  "version": 1,
  "achievements": [
    {
      "id": "01JB…",                 // ULID
      "title": "DB·Cache 최적화로 RPS 개선",  // 한 줄 요약(필수)
      "problem": "스트레스 테스트에서 RPS 부족·DB Timeout",  // 상세(선택)
      "approach": "캐시 계층화 + 복합/부분 인덱스",            // 상세(선택)
      "result": "DB 부하 대폭 감소",                          // 상세(선택)
      "tech": ["Redis", "MySQL", "복합인덱스"],                // 선택
      "theme": "성능·DB",                                     // 선택
      "star": true,                   // ⭐ 공개 Showcase 홈의 대표 성과로 노출
      "hidden": false,                // 선택. true면 공개 Showcase에서 제외(기본: 공개)
      "projectId": "01JC…",           // 선택. 연결된 Project.id (미지정 가능)
      "sourceDates": ["2026-10-03"],  // 근거 기록 날짜
      "createdBy": "ai",              // ai | manual
      "createdAt": "…", "updatedAt": "…"
    }
  ]
}
```

- 상세(problem·approach·result·tech)는 **뽑아낼 수 있을 때만**. 없으면 제목만(요약).
- 추출은 **수동 버튼**(`POST /api/achievements/extract`)으로만 — 범위의 기록에서 후보를 뽑아 돌려주고(저장 안 함), 사용자가 고른 것만 저장한다.
- `star`·`hidden`·`projectId` 는 공개 Showcase(2-3)용. 성과는 **기본 공개**, `hidden`으로만 숨기고, `star`는 홈 대표 노출, `projectId`로 프로젝트에 묶인다.

### 2.6 `meta/projects.json` (커리어 · 프로젝트)

성과를 묶는 단위. 공개 Showcase에서 최신순 목록·프로젝트별 보기로 묶인다.

```jsonc
{
  "version": 1,
  "projects": [
    {
      "id": "01JC…",                         // ULID
      "name": "그랑사가 키우기",
      "description": "모바일 수집·방치형 RPG",  // 선택
      "start": { "date": "2023-01", "note": "합류" },  // 월 단위, 코멘트 선택
      "end":   { "date": "2024-05", "note": "출시" },  // 또는 { "ongoing": true, "note": "개발 중" }
      "photos": [                              // 최대 10장, 첫 장이 대표
        { "id": "01JD…", "ext": "webp", "width": 1600, "height": 900, "bytes": 184320, "caption": "로비" }
      ],
      "order": 0,                              // 같은 날짜일 때의 보조 순서
      "createdAt": "…", "updatedAt": "…"
    }
  ]
}
```

- **정렬은 날짜로**(진행 중 → 종료 늦은 순 → 시작 늦은 순, 날짜 없으면 맨 아래). `src/lib/period.ts`.
- 예전 자유 글자 `period`("2023.01 합류 – 2024.05 출시", "2026.07(합류일) – 개발중")는 **읽을 때 start/end 로 옮긴다**. 연도만 있는 등 옮기지 못하면 `period` 를 그대로 두고 화면에서 수정을 안내한다. 옮긴 결과는 다음 저장 때 영구화된다.
- 프로젝트를 지우면 사진 파일도 지운다. 그 성과의 `projectId`는 그대로 남아 프로젝트별 보기에서 '기타'로 묶인다(성과는 보존).

### 2.6.1 `meta/media/<projectId>/<photoId>.<ext>` (프로젝트 사진, ADR-015)

- 브라우저에서 긴 변 1600px·WebP(안 되면 JPEG)로 다시 인코딩해 올린다 → 장당 수백 KB, EXIF(위치정보) 제거. 900KB 상한(nginx 기본 1MB 안쪽).
- 서버는 **바이트 시그니처**로 webp·jpg·png 만 받는다(SVG 등 거부).
- photoId 는 내용이 바뀌면 새로 발급(불변) → 공개 응답 `/showcase/media/<projectId>/<photoId>` 은 1년 `immutable` 캐시. **목록에 등록된 사진만** 응답한다(임의 레포 파일 읽기 방지).
- `/api/export`(JSON 내보내기)에는 사진이 포함되지 않는다. 시점 복원은 같은 레포라 사진까지 되돌아간다.

### 2.7 `meta/profile.json` (커리어 · 내 정보)

공개 Showcase 홈을 채우는 이름·직함·한마디·기술 스택·경력. 전부 수동 입력.

```jsonc
{
  "version": 1,
  "profile": {
    "name": "김서경",                       // 선택 — Showcase 제목·공유 미리보기
    "headline": "게임 서버 개발자",          // 선택
    "intro": "문제의 원인을 측정으로 …",     // 한마디(줄바꿈 유지)
    "techStack": [
      { "label": "언어 · 런타임", "items": ["C#", ".NET", "AWS(EC2, ALB)"] }
    ],
    "career": [
      { "id": "…", "org": "파이드픽셀즈", "role": "서버 프로그래머",
        "start": "2024-01", "current": true,         // 또는 "end": "2025-07"
        "note": "여러 줄 가능" }
    ]
  }
}
```

- 경력은 **최신순으로 정렬해 저장**한다(재직 중 → 종료 늦은 순). 예전 `period` 글자("2024.01 – 현재", "2022.07 - 2023.12")는 읽을 때 start/end/current 로 옮긴다.
- 공개 화면은 재직 기간("2년 10개월")과 겹침 없이 합친 총 경력을 계산해 보여준다.
- 기술 목록은 쉼표로 나누되 **괄호 안 쉼표는 나누지 않는다**("AWS(EC2, ALB)" 는 한 칩).
- 공개 홈 노출 순서: 한마디 → 기술 스택 → 경력 → 프로젝트 → ⭐ 대표 성과.

### 2.8 입력 한도와 "기존 글은 자르지 않는다"

- 화면 한도(`src/lib/career-limits.ts`): 한마디 500자, 경력 비고 500자(약 10줄), 프로젝트 소개 300자, 기간 코멘트 20자, 사진 설명 100자 — **새로 입력할 때만** 적용(maxLength·카운터).
- 서버는 이미 저장된 글을 **읽을 때 절대 자르지 않고**, 저장 시에도 남용 방지 상한(4000자)으로만 막는다. 한도를 나중에 바꿔도 예전 글이 사라지지 않게 하기 위함이다.

---

## 3. 로컬 쓰기 큐 (유일한 로컬 영속 데이터)

`/app/queue/pending.jsonl` — append-only JSON Lines.

```jsonl
{"op":"upsertEntry","date":"2026-10-01","entry":{...},"at":"2026-10-01T10:02:11+09:00","seq":1}
{"op":"deleteEntry","date":"2026-10-01","entryId":"01JA8Z...","at":"...","seq":2}
{"op":"putSummary","scope":"day","key":"2026-10-01","summary":{...},"at":"...","seq":3}
```

- 플러시 성공 시 **파일을 통째로 비운다**(truncate). 평상시 0바이트.
- 기동 시 이 파일이 비어 있지 않으면 즉시 플러시를 시도한다.
- **과거 기록을 보관하지 않는다.** 원격에 반영된 순간 사라지는 전송 버퍼다.

---

## 4. 메모리 인덱스

```ts
index: IndexFile                       // index.json 전량 상주 (~100KB)
months: LRUCache<string, MonthFile>    // "2026-10" → 월 데이터. 상한 24개
weeklies: LRUCache<string, WeeklySummary>
tagIndex: Map<string, Set<string>>     // 태그 → 날짜 집합. index.json 로드 시 구성
```

- LRU 상한 24개월 ≈ 1.5MB. RSS 목표 250MB에 영향 없다.
- 프로세스 재시작 시 전부 소멸하고 필요할 때 다시 받는다. **캐시는 진실의 원천이 아니다.**

---

## 5. API 설계

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/auth/login` | 비밀번호 → 세션 쿠키 |
| POST | `/api/auth/logout` | 세션 파기 |
| GET | `/api/calendar?month=2026-10` | 달력 렌더 데이터 (index 기반, 원격 fetch 0회) |
| GET | `/api/journal/:date` | 하루 엔트리 + 일간 요약 |
| POST | `/api/journal/:date/entries` | 엔트리 생성 |
| PATCH | `/api/journal/:date/entries/:id` | 엔트리 수정 |
| DELETE | `/api/journal/:date/entries/:id` | 엔트리 삭제 |
| GET/PUT | `/api/summary/day/:date` | 일간 요약 조회/수정 |
| POST | `/api/summary/day/:date/generate` | 일간 요약 AI 재생성 |
| GET/PUT | `/api/summary/week/:isoWeek` | 주간 요약 (`generate` 동일 패턴) |
| GET/PUT | `/api/summary/month/:ym` | 월간 요약 (`generate` 동일 패턴) |
| GET | `/api/search?tag=&category=&from=&to=&q=` | 검색 |
| GET/PUT | `/api/settings` | 설정 |
| GET/POST | `/api/achievements` | 성과 목록 / 여러 건 저장 |
| PATCH/DELETE | `/api/achievements/:id` | 성과 수정(⭐·숨김·프로젝트 포함. `projectId: ""` = 미지정) / 삭제 |
| POST | `/api/achievements/extract` | 범위의 기록에서 성과 후보 추출(저장 안 함) |
| GET/POST | `/api/projects` | 프로젝트 목록 / 추가 |
| PATCH/DELETE | `/api/projects/:id` | 프로젝트 수정(이름·소개·기간, 사진 순서·설명) / 삭제(사진 파일 포함, 연결된 성과는 '기타'로 남음) |
| POST | `/api/projects/:id/photos?w=&h=` | 사진 추가(본문 = 이미지 바이트, 최대 10장·900KB) |
| DELETE | `/api/projects/:id/photos/:photoId` | 사진 삭제(파일 포함) |
| GET/PUT | `/api/profile` | 내 정보(이름·직함·한마디·기술 스택·경력) 조회 / 전체 교체 |
| GET | `/showcase/media/:projectId/:photoId` | 공개 프로젝트 사진(인증 불필요, 등록된 사진만, immutable 캐시) |
| POST | `/api/push/subscribe` | 푸시 구독 등록 |
| DELETE | `/api/push/subscribe/:id` | 구독 해제 |
| GET | `/api/sync/status` | 큐 길이, 마지막 성공 시각, 저하 여부 |
| POST | `/api/sync/flush` | 수동 플러시 |
| GET | `/api/sync/history` | 원격 커밋 이력 |
| POST | `/api/sync/restore` | 특정 커밋 시점으로 복원 |
| GET | `/api/export` | 전체 JSON 내보내기 |
| GET | `/api/health` | 헬스체크 (인증 불필요) |

- 공개 Showcase(`/showcase`)는 **API 없이 SSR**로만 노출한다. 서버에서 `meta/`를 읽어 허용 필드만 담은 공개 DTO로 렌더한다(ADR-013). 위 API는 전부 인증 필요.
- 인증 없이 열리는 경로는 `src/lib/public-paths.ts` 한 곳에서만 판정하고, 범위는 `public-paths.test.ts` 로 고정한다.

### 응답 규약

- 읽기 응답에는 항상 동기화 상태를 실어 보낸다: `{ data, meta: { stale: boolean, pendingWrites: number } }`
- 클라이언트는 `stale`이 true면 저하 배너를 띄운다. **데이터를 숨기지는 않는다.**

---

## 6. 코드 규약

데이터를 다루는 코드가 지켜야 할 약속. 여기서 어긋나면 날짜 경계나 정렬이 조용히 틀어진다.

- **날짜 키는 문자열로 다룬다.** 일 `YYYY-MM-DD`, 월 `YYYY-MM`, 주 ISO `YYYY-Www`. 경계 계산 외에는 `Date` 객체를 만들지 않고, 함수 인자로 넘기지도 않는다.
- **타임존은 `Asia/Seoul` 고정.** 날짜 경계 계산에 UTC를 섞지 않는다. 자정 직전 기록이 전날/다음날로 밀리는 버그의 원인이 된다.
- **엔트리 id는 ULID.** 생성 시각이 id에 포함되어 시간순 정렬이 가능하다.
- **엔트리 배열은 항상 `start` 오름차순**으로 유지한다. 읽는 쪽에서 정렬하지 않는다.
- **서버 전용 모듈은 `server-only`를 import한다.** 원격 저장소 토큰·API 키를 다루는 코드가 클라이언트 번들에 섞이는 것을 컴파일 타임에 막는다.
- **읽기 API 응답에는 항상 `meta`를 싣는다**(§5 응답 규약). UI는 저하 상태를 숨기지 않는다.
- 저장 계층의 재시도·병합 로직에는 **"왜"를 주석으로 남긴다.** 무엇을 하는지는 코드가 말한다.

---

## 7. 확장 지점 (2단계)

```jsonc
// career/applications/<id>.json
{
  "id": "…", "company": "…", "position": "…",
  "appliedAt": "2026-11-01",
  "stages": [{ "name": "서류", "date": "…", "result": "pass" }],
  "result": "pending",
  "retrospective": "…",
  "linkedResumeId": "…"
}

// career/resumes/<id>.json
{
  "id": "…", "title": "…", "version": 3,
  "sections": [{ "type": "experience", "content": "…", "sourceRange": { "from": "2025-01", "to": "2026-10" } }]
}
```

`sourceRange`가 핵심이다. 이력서 섹션이 **어느 기간의 기록에서 생성되었는지**를 남겨, 기록이 보강되면 해당 섹션만 재생성할 수 있다.
