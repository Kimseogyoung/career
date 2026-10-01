# Career Log

1인용 커리어 기록 웹서버. 홈서버에 띄워서 쓴다.

**매일 1시간 단위로 한 일을 기록 → 일·주·월 요약 자동 생성 → 그 기록에서 이력서를 뽑아낸다.**

## 상태

설계 완료, 구현 전. → [로드맵](docs/ROADMAP.md)

## 문서

| | |
|---|---|
| [기획서](docs/PLAN.md) | 무엇을 왜 만드는가, 기능 명세, 화면 |
| [아키텍처](docs/ARCHITECTURE.md) | 시스템 구성, 저장 계층, 배포, 장애 동작 |
| [데이터 모델](docs/DATA-MODEL.md) | 저장 레이아웃, JSON 스키마, API |
| [설계 결정](docs/DECISIONS.md) | ADR — 무엇을 포기했고 언제 뒤집는가 |
| [로드맵](docs/ROADMAP.md) | 단계별 범위 |
| [CLAUDE.md](CLAUDE.md) | Claude Code 작업 규칙 |

## 한눈에 보는 구조

```
브라우저/PWA ──HTTPS──> Cloudflare Tunnel ──> 홈서버 (Next.js 컨테이너 1개)
                                                 │
                                   ┌─────────────┴─────────────┐
                                   ▼                           ▼
                        private GitHub 레포            Claude API
                        (기록의 정본)                  (요약 생성)
```

- 기록의 정본은 **원격 private GitHub 레포**. 홈서버에 과거 기록을 보관하지 않는다.
- 로컬에 남는 것은 **미동기화 쓰기 큐**(평상시 0바이트)뿐.
- 캐시는 Node 프로세스 메모리 LRU. 별도 DB도 Redis도 없다.
- 매 정시 **Web Push 알림** → 클릭하면 그 시간 슬롯 입력 폼으로 직행.

## 시작하기

> 아직 구현 전이다. 아래는 1단계 완료 후의 절차.

```bash
cp .env.example .env     # 토큰·키 채우기
docker compose pull
docker compose up -d
```

이미지는 **서버에서 빌드하지 않는다.** 개발 머신이나 CI에서 빌드해 레지스트리에 올린 뒤 pull한다. ([근거](docs/DECISIONS.md#adr-009-서버에서-빌드하지-않는다))

### 필요한 것

- Linux + Docker Compose가 도는 홈서버 (여유 디스크 1GB 이상)
- 데이터 전용 **private GitHub 레포** + contents 읽기/쓰기 권한 PAT
- (선택) Anthropic API 키 — 없으면 요약은 수동 작성으로 폴백
- (선택) Cloudflare Tunnel — 외부에서 접속하려면
