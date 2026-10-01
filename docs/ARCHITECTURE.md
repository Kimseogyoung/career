# 아키텍처

## 1. 전체 구성

```
┌──────────────┐        ┌──────────────┐        ┌──────────────┐
│  집 PC       │        │  회사 PC     │        │  모바일      │
│  (브라우저)  │        │  (PWA 설치)  │        │  (PWA 설치)  │
└──────┬───────┘        └──────┬───────┘        └──────┬───────┘
       │                       │  ▲ Web Push           │
       └───────────────────────┼──┴────────────────────┘
                               │ HTTPS
┌──────────────────────────────▼──────────────────────────────┐
│ 홈서버 (Linux)                                               │
│                                                              │
│   nginx 리버스 프록시  ── career.sandbox.seogyoung.com        │
│   (별도 레포가 관리, Let's Encrypt)                           │
│            │ http://127.0.0.1:13000                          │
│            ▼                                                 │
│   ┌──────────────────────────────────┐                       │
│   │ career-log (Docker, Next.js)     │                       │
│   │  ├ App Router (UI)               │                       │
│   │  ├ Route Handlers (API)          │                       │
│   │  ├ 메모리 LRU 캐시 (24개월)      │                       │
│   │  ├ 쓰기 큐 (미동기화분 한정)     │                       │
│   │  └ node-cron 스케줄러            │                       │
│   └──────────────┬───────────────────┘                       │
└──────────────────┼──────────────────────────────────────────┘
                   │ HTTPS
       ┌───────────┴───────────┐
       ▼                       ▼
┌───────────────────┐  ┌───────────────────┐
│ GitHub (private)  │  │  Claude API       │
│  ← 기록의 정본    │  │  claude-opus-5    │
│  Contents API     │  │  요약 생성        │
└───────────────────┘  └───────────────────┘
```

**컨테이너는 1개다.** 프론트엔드, API, 스케줄러가 한 Next.js 프로세스 안에 있다. 저사양 홈서버에서 프로세스 수를 늘리지 않는 것이 이 설계의 기본 원칙이다.

---

## 2. 기술 스택

| 영역       | 선택                                                                    | 비고                            |
| ---------- | ----------------------------------------------------------------------- | ------------------------------- |
| 프레임워크 | Next.js (App Router) + TypeScript                                       | UI·API·스케줄러가 한 프로세스   |
| 스케줄러   | node-cron                                                               | `instrumentation.ts`에서 기동   |
| 요약       | `@anthropic-ai/sdk` — `claude-opus-5`, `thinking: { type: "adaptive" }` | 키 없으면 수동 폴백             |
| 알림       | `web-push` (VAPID) + Service Worker                                     | PWA                             |
| 인증       | argon2 해시 + JWT httpOnly 쿠키                                         | 사용자 테이블 없음              |
| 원격 저장  | GitHub Contents API (`fetch`)                                           | git 바이너리·로컬 `.git` 불필요 |
| 캐시       | 프로세스 내 LRU                                                         | 외부 캐시 서버 없음             |
| 배포       | Docker multi-stage (`output: "standalone"`, node alpine) + Compose      | 서버에서 빌드하지 않음          |

새 런타임 의존성을 추가하기 전에 [DECISIONS.md](./DECISIONS.md)의 "프로세스를 늘리지 않는다" 제약과 충돌하지 않는지 확인한다.

---

## 3. 저장 계층

### 3.1 세 계층의 역할

| 계층            | 위치                | 수명          | 담는 것                                |
| --------------- | ------------------- | ------------- | -------------------------------------- |
| **원격 정본**   | private GitHub 레포 | 영구          | 모든 기록. 유일한 진실의 원천          |
| **메모리 캐시** | Node 프로세스       | 프로세스 수명 | 최근 접근 월 데이터 (LRU, 상한 24개월) |
| **쓰기 큐**     | 서버 디스크         | 동기화까지    | 아직 원격에 반영 안 된 변경분**만**    |

홈서버 디스크에 과거 기록이 남지 않는다. 쓰기 큐는 원격 반영에 성공하는 즉시 삭제된다.

### 3.2 읽기 경로

```
GET /day/2026-10-01
  │
  ├─ 메모리 캐시에 2026-10 있음? ──── yes ──→ 응답 (≈1ms)
  │
  └─ no ─→ GitHub Contents API: journal/2026/2026-10.json
            │
            ├─ 200 ─→ 파싱 → LRU 적재 → 응답 (≈300–800ms)
            ├─ 404 ─→ 빈 월로 간주 (아직 기록 없음) → 응답
            └─ 실패 ─→ 캐시에 있으면 stale 반환 + 저하 배너
                       없으면 503 + 재시도 안내
```

달력(월 뷰)은 `index.json` 1개만 읽으면 렌더된다. 월 상세로 들어갈 때 비로소 해당 월 파일을 읽는다.

### 3.3 쓰기 경로

```
PUT /api/journal/2026-10-01/entries/<id>
  │
  ├─ 1. 메모리 캐시 즉시 갱신 → 클라이언트에 200 (낙관적 UI)
  ├─ 2. 쓰기 큐에 변경분 append (fsync)
  └─ 3. 10초 디바운스 타이머 재설정
          │
          └─ 발화 시:
               a. 해당 월 파일의 최신 sha 확보 (캐시에 보관)
               b. 큐의 변경분을 월 데이터에 병합
               c. PUT contents/journal/2026/2026-10.json { content, sha }
               d. index.json 도 같은 방식으로 갱신
               e. 성공 → 큐에서 제거, 새 sha 저장
                  409  → 원격 재읽기 → 병합 → 재시도 (최대 3회)
                  기타 → 지수 백오프 (30s → 2m → 10m → 1h), 큐 유지
```

**핵심 불변식**: 쓰기 큐가 비어 있다 == 모든 변경이 원격에 반영되었다. 이 불변식이 깨지지 않는 한 데이터는 유실되지 않는다.

### 3.4 왜 월 단위 파일인가

네트워크가 정본이면 **API 요청 수가 곧 응답 속도**다.

| 파일 단위             | 월 달력 렌더         | 월 상세 | 쓰기 1회당 전송량 |
| --------------------- | -------------------- | ------- | ----------------- |
| 하루 1파일            | 30회 fetch (≈10s) ❌ | 30회    | 2KB               |
| **월 1파일 + 인덱스** | **1회** ✅           | 1회     | 60KB              |
| 연 1파일              | 1회                  | 1회     | 700KB ❌          |

월 파일은 1년 뒤에도 60KB 수준이라 전송 비용이 무시 가능하고, 요청 수를 최소로 묶는다. 인덱스 파일은 달력이 월 파일 없이도 렌더되게 해 추가 1회를 더 줄인다.

---

## 4. 인증

- **단일 사용자.** 비밀번호 argon2 해시를 환경변수로 보관(`AUTH_PASSWORD_HASH`). DB도 사용자 테이블도 없다.
- 로그인 성공 시 JWT를 httpOnly + Secure + SameSite=Lax 쿠키로 발급(유효기간 30일, 슬라이딩 갱신).
- 모든 `/api/*`와 페이지는 미들웨어에서 세션을 검사한다. `/login`, `/api/auth/login`, 서비스워커 관련 경로만 예외.
- 로그인 엔드포인트에 레이트 리밋(IP당 5회/분). 외부 노출 전제이므로 필수.
- **GitHub PAT와 Anthropic API 키는 서버 환경변수로만 존재한다.** 클라이언트 번들에 절대 들어가지 않는다(`NEXT_PUBLIC_` 접두사 금지, VAPID 공개키만 예외).
- 비밀값을 다루는 모듈은 `server-only`를 import해 클라이언트 유입을 컴파일 타임에 차단한다.

---

## 5. 알림 (Web Push)

```
[설치] 브라우저 → 알림 권한 요청 → PushSubscription 생성
                → POST /api/push/subscribe → 원격 settings.json 에 저장

[발송] node-cron 매시 정각
         → 설정된 기록 시간대·요일인가?
         → 직전 슬롯이 이미 기록되었는가? (기록됐으면 skip)
         → web-push 로 모든 구독 엔드포인트에 발송
         → 410 Gone 응답 구독은 자동 제거

[수신] Service Worker → notificationclick
         → /quick?slot=2026-10-01T14 로 포커스 또는 신규 창
```

- VAPID 키쌍은 `npm run gen:vapid`로 1회 생성해 환경변수에 넣는다.
- iOS Safari는 **홈 화면에 추가한 PWA에서만** 푸시를 지원한다. 설정 화면에 안내를 넣는다.

---

## 6. 스케줄러

`instrumentation.ts`에서 node-cron을 기동한다. Next.js standalone 서버 프로세스 안에서 돈다.

| 잡               | 시각 (KST)     | 하는 일                                         |
| ---------------- | -------------- | ----------------------------------------------- |
| 기록 알람        | 매시 정각      | §5 참조                                         |
| 일간 요약        | 매일 23:50     | 그날 엔트리 → Claude 요약 → 원격 기록           |
| 주간 요약        | 일 23:55       | 그 주 일간 요약 → Claude 요약                   |
| 월간 요약        | 말일 23:55     | 그 달 주간 요약 → Claude 요약                   |
| 큐 플러시 재시도 | 5분마다        | 쓰기 큐가 비어 있지 않으면 재동기화 시도        |
| 스냅샷           | 매월 1일 04:00 | 전체를 tar.gz로 묶어 `snapshots/` 경로에 업로드 |

멀티 인스턴스를 가정하지 않는다(단일 컨테이너). 중복 실행 방지 락은 두지 않는다.

---

## 7. 요약 생성 (Claude API)

- SDK: `@anthropic-ai/sdk`, 모델 `claude-opus-5`, `thinking: { type: "adaptive" }`.
- 입력은 해당 기간의 엔트리/하위 요약뿐. 토큰이 작아(1K 미만) 스트리밍 불필요.
- 결과는 `{ text, generatedBy: "ai" | "manual", model, generatedAt, editedAt }`로 보관해 **AI 초안과 사람이 고친 것을 구분**한다.
- 실패 시: 요약을 비워두고 `status: "failed"` 기록. 다음 스케줄이나 수동 버튼에서 재시도. **요약 실패가 기록 기능을 막지 않는다.**
- 키가 없으면 호출 자체를 건너뛰고 수동 작성 UI를 띄운다.

---

## 8. 배포

### 8.1 빌드는 서버 밖에서

홈서버 여유 디스크는 4GB다. 거기서 `npm ci && next build`를 돌리면 일시적으로 1GB 가까이 쓴다. **데이터가 아니라 빌드가 실제 위협이다.**

```
개발 머신 또는 GitHub Actions
  → docker build (multi-stage, output: "standalone", node:22-alpine)
  → ghcr.io/<user>/career-log:<tag> 로 push
홈서버
  → docker compose pull && docker compose up -d     ← 빌드 없음
```

최종 이미지 목표 크기: **200MB 이하.**

### 8.2 compose 구성

```yaml
services:
  app:
    image: ghcr.io/<user>/career-log:latest
    restart: unless-stopped
    env_file: .env
    ports: ["127.0.0.1:13000:3000"] # nginx가 앞단. 외부에 직접 열지 않는다
    volumes:
      - ./queue:/app/queue # 미동기화 쓰기 큐만. 과거 기록 아님
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
```

볼륨은 쓰기 큐 하나뿐이다. 이 볼륨을 날려도 **미동기화분만** 잃고 과거 기록은 원격에 그대로 있다.

### 8.3 외부 노출

**이미 운영 중인 nginx 리버스 프록시를 재사용한다.** 이 프로젝트는 HTTPS를 직접 처리하지 않는다.

- 별도 레포(`SeogyoungNetComInfra`)가 nginx 설정과 Let's Encrypt 인증서를 관리한다.
- 패턴: 서브도메인 하나당 conf 파일 하나, `proxy_pass`로 `127.0.0.1:<포트>`에 넘긴다. 기존 앱들이 11000·12000번을 쓰고 있으므로 이 앱은 **13000번**을 쓴다.

추가해야 할 것은 두 가지다.

1. `nginx/conf.d/career.conf` 신규 작성

```nginx
server {
    listen 80;
    server_name career.sandbox.seogyoung.com;

    location / {
        proxy_pass http://127.0.0.1:13000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;   # ← 아래 주의 참조
    }
}
```

2. `ssl_setup.sh`의 `DOMAINS` 배열에 `career.sandbox.seogyoung.com` 추가 후 재발급.

> **`X-Forwarded-Proto`는 빠뜨리면 안 된다.** 기존 conf들에는 이 헤더가 없다. 이게 없으면 앱이 요청을 HTTP로 인식해 **세션 쿠키의 `Secure` 플래그를 붙이지 못하고**, 그 결과 로그인이 유지되지 않는다.

> **HTTPS는 선택이 아니다.** Web Push와 Service Worker는 보안 컨텍스트에서만 동작하므로, 인증서가 없으면 기록 알람 기능 자체가 뜨지 않는다.

---

## 9. 장애 시 동작

| 상황                | 동작                                                                      |
| ------------------- | ------------------------------------------------------------------------- |
| GitHub API 장애     | 캐시된 월은 조회 가능(stale 배너). 쓰기는 큐에 쌓이고 5분마다 재시도      |
| PAT 만료            | 401 감지 → 설정 화면에 경고 배너 + 쓰기 큐 유지. 토큰 교체 후 자동 플러시 |
| 네트워크 단절       | 위와 동일. 앱은 계속 뜬다                                                 |
| Claude API 장애     | 요약만 실패 기록. 기록 CRUD는 영향 없음                                   |
| 컨테이너 재시작     | 캐시 소멸(재적재됨). 쓰기 큐는 볼륨에 남아 기동 직후 플러시               |
| 레이트 리밋(5000/h) | 단일 사용자 + 디바운스로 도달 불가능. 도달 시 백오프                      |
