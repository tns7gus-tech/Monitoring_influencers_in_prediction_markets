# Next Session Handoff

작성일: 2026-03-14
프로젝트: `Prediction Alpha Monitor`

## 현재까지 완료된 범위

- Polymarket 공개 API 기반 실데이터 sync
- SQLite 저장 구조
- 정확도 중심 트레이더 랭킹
- watchlist 저장 + 규칙형 알림
- 시장 drill-down + 최근 1주 가격 차트
- 기간 선택형 실거래 백테스트
- 저장형 백테스트 이력 조회
- 알림 채널 설정
- 채널 테스트 발송
- queued delivery 로그 저장

## 현재 핵심 아키텍처

- 수집: `sync-polymarket.js` -> `src/sync.js`
- 저장: `src/db.js`
- 서비스 계층: `src/monitor-service.js`
- API 서버: `server.js`
- 프론트 UI: `index.html`, `src/main.js`, `src/styles.css`
- 알림 발송 추상화: `src/notifications.js`

## 지금 동작하는 주요 API

- `GET /api/bootstrap`
- `POST /api/sync`
- `GET /api/watchlist`
- `POST /api/watchlist`
- `DELETE /api/watchlist/:wallet`
- `GET /api/alerts`
- `POST /api/alerts/read-all`
- `GET /api/markets`
- `GET /api/markets/:slug`
- `GET /api/traders/:id/backtest`
- `GET /api/backtests`
- `POST /api/backtests`
- `GET /api/backtests/:id`
- `GET /api/notification-channels`
- `POST /api/notification-channels`
- `DELETE /api/notification-channels/:id`
- `POST /api/notification-channels/:id/test`
- `GET /api/notification-deliveries`

## 현재 DB에 있는 주요 테이블

- `snapshot_meta`
- `traders_current`
- `signals_current`
- `markets_current`
- `watchlist_targets`
- `alerts`
- `sync_runs`
- `backtest_runs`
- `notification_channels`
- `notification_deliveries`

## 오늘 마지막 기준 검증 상태

- `npm.cmd test` 통과
- 총 `32`개 테스트 통과
- 서버 스모크 테스트 통과
- `notification channel` 생성/테스트/로그 기록 확인
- mock 채널 테스트 결과
  - `mock://success` 성공
  - `mock://fail` 실패 시뮬레이션 가능

## 바로 실행하는 방법

```bash
node server.js
```

브라우저:

```text
http://127.0.0.1:4173
```

실데이터 동기화:

```bash
node sync-polymarket.js
```

테스트:

```bash
npm.cmd test
```

## 내일 바로 이어서 개발할 추천 순서

### 1순위: 사용자 계정/권한 분리

목표:
- 공용 대시보드에서 개인화 서비스로 전환
- watchlist / notification / backtest history를 사용자별로 분리

우선 작업 순서:
1. `users`, `sessions` 테이블 추가
2. `watchlist_targets`, `backtest_runs`, `notification_channels`, `notification_deliveries`에 `user_id` 연결
3. `server.js`에 로그인/로그아웃/session API 추가
4. `monitor-service.js`와 `db.js` 메서드를 사용자 기준으로 바꾸기
5. 프론트에서 익명 상태 / 로그인 상태 분기 추가

먼저 수정할 파일:
- `src/db.js`
- `src/monitor-service.js`
- `server.js`
- `src/main.js`
- `index.html`

### 2순위: watchlist별 알림 조건 고도화

후보:
- 시장 카테고리별 필터
- YES/NO 방향 필터
- 최소 conviction
- 최근 N시간 이내만

### 3순위: 시계열 비교 차트

후보:
- 트레이더별 정확도 추이
- 시장별 tracked wallet 진입 강도 추이
- 백테스트 run 간 ROI 비교

## 내일 개발 시작 전에 꼭 기억할 점

- 지금 기준 제품의 핵심 판단 지표는 `예측 정확도` 우선이다.
- Kalshi 통합은 아직 하지 않았다.
- 외부 발송은 실제 webhook/telegram도 가능하지만, 테스트는 mock으로 먼저 확인하면 빠르다.
- 알림은 새 alert 생성 시 `notification_deliveries`에 queued로 저장되고, 서비스 계층에서 flush한다.

## 핵심 파일 위치

- 백테스트 엔진: `/src/backtest.js`
- 메트릭/검증: `/src/metrics.js`
- 알림 발송: `/src/notifications.js`
- DB 저장소: `/src/db.js`
- 서비스 계층: `/src/monitor-service.js`
- API 서버: `/server.js`
- 프론트 로직: `/src/main.js`
- 마크업: `/index.html`
- 스타일: `/src/styles.css`

## 현재 남아 있는 제한

- 인증이 없어서 모든 데이터가 단일 사용자 기준처럼 동작한다.
- notification delivery는 현재 앱 프로세스 안에서 flush된다.
- 백그라운드 작업 큐/재시도 정책은 아직 단순하다.
- Polymarket 공개 데이터 한계 때문에 내부자 판별은 직접 하지 않고, 공개 지갑 행동 기반으로만 추론한다.

## 마지막 한 줄 요약

지금 상태는 `실데이터 추적 + 백테스트 + 알림 채널 + 발송 로그`까지 완료된 MVP이며, 다음 세션의 최우선 작업은 `사용자 계정/권한 분리`다.
