# Career Log

**1인용 업무 일지 서버.** 홈서버에 띄워서 쓴다.

하루에 한 일을 **1시간 단위로 기록**하고, 하루가 끝나면 그날을, 한 주가 끝나면 그 주를, 한 달이 끝나면 그 달을 **요약해서 쌓는다.**

- 달력 화면이 기본. 주간 요약이 항상 보이고, 일 셀에는 그날 요약 첫 줄만 `…`로 줄여 보인다.
- 일 셀을 누르면 그날의 **시간 단위 기록 전체**를 보고 고칠 수 있다.
- 매 정시 **알림**이 뜨고, 누르면 그 시간대 입력 폼으로 바로 들어간다.

## 상태

설계 완료, 구현 전. → [로드맵](docs/ROADMAP.md)

> **이 프로젝트는 바이브 코딩으로 만들어집니다.**
> 기획·설계 문서와 코드 대부분을 [Claude Code](https://claude.com/claude-code)로 작성합니다.
> 설계 결정의 근거와 포기한 선택지는 [DECISIONS.md](docs/DECISIONS.md)에,
> AI가 따라야 할 제약은 [CLAUDE.md](CLAUDE.md)에 남겨 둡니다.

## 문서

| | |
|---|---|
| [기획서](docs/PLAN.md) | 무엇을 왜 만드는가, 기능 명세, 화면 |
| [아키텍처](docs/ARCHITECTURE.md) | 시스템 구성, 기술 스택, 저장 계층, 배포, 장애 동작 |
| [데이터 모델](docs/DATA-MODEL.md) | 저장 레이아웃, 스키마, API, 코드 규약 |
| [설계 결정](docs/DECISIONS.md) | ADR — 무엇을 포기했고 언제 뒤집는가 |
| [로드맵](docs/ROADMAP.md) | 단계별 범위 |
| [CLAUDE.md](CLAUDE.md) | Claude Code 작업 규칙 |

## 한눈에 보는 구조

```
브라우저/PWA ──HTTPS──> nginx(기존 인프라) ──> career-log 컨테이너
                                                    │
                                      ┌─────────────┴─────────────┐
                                      ▼                           ▼
                             private GitHub 레포           Claude API
                             (기록의 정본)                 (요약 생성)
```

- 기록의 정본은 **원격 private GitHub 레포**. 홈서버에 과거 기록을 보관하지 않는다.
- 로컬에 남는 것은 **미동기화 쓰기 큐**(평상시 0바이트)뿐.
- 캐시는 프로세스 메모리 LRU. 별도 DB도 캐시 서버도 없다.

## 시작하기

> 아직 구현 전이다. 아래는 1단계 완료 후의 절차.

```bash
cp .env.example .env     # 토큰·키 채우기
docker compose pull
docker compose up -d
```

이미지는 **서버에서 빌드하지 않는다.** 개발 머신이나 CI에서 빌드해 레지스트리에 올린 뒤 pull한다. ([근거](docs/DECISIONS.md))

### 필요한 것

- Linux + Docker Compose가 도는 홈서버
- 데이터 전용 **private GitHub 레포** + contents 읽기/쓰기 권한 PAT
- nginx 리버스 프록시에 서브도메인 1개 추가 (HTTPS 필수 — 알림이 보안 컨텍스트를 요구한다)
- (선택) Anthropic API 키 — 없으면 요약은 수동 작성으로 폴백

### 나중에

업무 기록이 쌓이면 그걸 근거로 이력서·지원 내역을 관리하는 기능을 올릴 계획이다. MVP 범위는 아니다. → [로드맵 2·3단계](docs/ROADMAP.md)
