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
  "summary": { "autoGenerate": true, "model": "claude-opus-5" }
}
```

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
| POST | `/api/push/subscribe` | 푸시 구독 등록 |
| DELETE | `/api/push/subscribe/:id` | 구독 해제 |
| GET | `/api/sync/status` | 큐 길이, 마지막 성공 시각, 저하 여부 |
| POST | `/api/sync/flush` | 수동 플러시 |
| GET | `/api/sync/history` | 원격 커밋 이력 |
| POST | `/api/sync/restore` | 특정 커밋 시점으로 복원 |
| GET | `/api/export` | 전체 JSON 내보내기 |
| GET | `/api/health` | 헬스체크 (인증 불필요) |

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
