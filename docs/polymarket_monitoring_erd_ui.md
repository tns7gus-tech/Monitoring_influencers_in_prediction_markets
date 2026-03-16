# Polymarket 인플루언서 모니터링 웹 ERD/DB 스키마 및 화면설계서

작성일: 2026-03-14  
연계 문서: `polymarket_monitoring_plan.md`  
대상 범위: MVP ~ 확장 단계  
문서 목적: 데이터 구조, 핵심 엔티티 관계, 주요 화면 설계, API/백엔드 처리 흐름 정리

---

## 1. 문서 목적

본 문서는 이전 기획서의 후속 상세 문서로서 다음 내용을 정의한다.

- 서비스 핵심 엔티티와 관계 구조
- MVP 기준 데이터베이스 테이블 설계
- 집계/백테스트용 파생 테이블 설계
- 주요 화면(대시보드, 랭킹, 트레이더 상세, 백테스트) UI 구성
- 백엔드 수집/집계/조회 API 흐름
- 추후 실제 카피베팅 확장 시 필요한 확장 포인트

본 문서는 **Polymarket 공개 데이터 기반의 모니터링 웹**을 전제로 하며, 실제 주문 실행 기능은 포함하지 않는다.

---

## 2. 시스템 개요

### 2.1 시스템 구성

서비스는 크게 4개 레이어로 나뉜다.

1. 데이터 수집 레이어
- 시장 목록 수집
- 가격/오더북 수집
- 체결/거래 이벤트 수집
- 시장 종료 및 정산 결과 수집

2. 정규화 및 분석 레이어
- 원천 데이터를 정규화된 구조로 변환
- 주소별 거래 이벤트 재구성
- 포지션 추정 및 손익 계산
- 기간별 성과 집계

3. 서비스 API 레이어
- 랭킹 조회 API
- 트레이더 상세 API
- 시장 상세 API
- 백테스트 실행 API
- 비교 분석 API

4. 프론트엔드 레이어
- 메인 대시보드
- 트레이더 리더보드
- 트레이더 상세 페이지
- 시장 상세 페이지
- 백테스트 시뮬레이터

---

## 3. 핵심 엔티티 정의

### 3.1 주요 엔티티 목록

MVP 기준 핵심 엔티티는 아래와 같다.

- `markets` : 예측 시장
- `market_outcomes` : 시장별 outcome(YES/NO 등)
- `events` : 상위 이벤트/주제
- `traders` : 추적 대상 주소
- `trades` : 체결/거래 이벤트
- `positions` : 주소별 시장 포지션 추정값
- `market_resolutions` : 시장 정산 결과
- `trader_daily_stats` : 주소별 일간 성과
- `trader_period_stats` : 주소별 기간 집계 성과
- `backtest_runs` : 백테스트 실행 메타 정보
- `backtest_run_items` : 백테스트 결과 세부 항목
- `watchlists` : 관심 트레이더 목록
- `watchlist_items` : 관심목록 내 주소 매핑

---

## 4. ERD 개요

아래는 논리적 관계 요약이다.

- 하나의 `event` 는 여러 `market` 를 가질 수 있다.
- 하나의 `market` 는 여러 `market_outcome` 을 가진다.
- 하나의 `market` 에는 여러 `trade` 가 발생한다.
- 하나의 `trader` 는 여러 `trade` 를 가진다.
- `trade` 는 `trader` 와 `market` 를 연결하는 핵심 팩트 테이블이다.
- `positions` 는 `trader + market + outcome` 기준의 현재 또는 특정 시점 포지션 요약이다.
- `market_resolutions` 는 `market` 종료 후 결과를 저장한다.
- `trader_daily_stats` 와 `trader_period_stats` 는 `trade`, `positions`, `market_resolutions` 를 기반으로 집계된다.
- `backtest_runs` 는 특정 전략 실행 메타 정보를 저장하고, `backtest_run_items` 가 일자별/트레이더별/시장별 결과를 저장한다.

---

## 5. 테이블 설계 상세

아래 스키마는 PostgreSQL 기준 권장안이다.

### 5.1 events

예측 시장의 상위 주제 또는 이벤트 단위.

```sql
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  external_event_id VARCHAR(100) NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category VARCHAR(100),
  subcategory VARCHAR(100),
  description TEXT,
  event_start_at TIMESTAMPTZ,
  event_end_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

권장 인덱스
- `external_event_id`
- `category, status`
- `event_end_at`

---

### 5.2 markets

실제 거래 가능한 개별 시장.

```sql
CREATE TABLE markets (
  id BIGSERIAL PRIMARY KEY,
  external_market_id VARCHAR(100) NOT NULL UNIQUE,
  event_id BIGINT REFERENCES events(id),
  slug TEXT,
  question TEXT NOT NULL,
  market_type VARCHAR(50),
  currency VARCHAR(20),
  status VARCHAR(30) NOT NULL,
  is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
  open_at TIMESTAMPTZ,
  close_at TIMESTAMPTZ,
  resolve_at TIMESTAMPTZ,
  liquidity_usd NUMERIC(20,8),
  volume_usd NUMERIC(20,8),
  last_price NUMERIC(20,8),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

권장 인덱스
- `external_market_id`
- `event_id`
- `status, is_resolved`
- `close_at`

---

### 5.3 market_outcomes

YES/NO 또는 다중 outcome 구조 저장.

```sql
CREATE TABLE market_outcomes (
  id BIGSERIAL PRIMARY KEY,
  market_id BIGINT NOT NULL REFERENCES markets(id),
  outcome_code VARCHAR(50) NOT NULL,
  outcome_name VARCHAR(100) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_winner BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (market_id, outcome_code)
);
```

---

### 5.4 traders

주소 단위의 추적 대상.

```sql
CREATE TABLE traders (
  id BIGSERIAL PRIMARY KEY,
  wallet_address VARCHAR(128) NOT NULL UNIQUE,
  display_name VARCHAR(200),
  label VARCHAR(200),
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  risk_profile VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

권장 인덱스
- `wallet_address`
- `last_seen_at`
- `is_active`

---

### 5.5 trades

가장 중요한 팩트 테이블. 체결/거래 이력을 저장한다.

```sql
CREATE TABLE trades (
  id BIGSERIAL PRIMARY KEY,
  external_trade_id VARCHAR(150) UNIQUE,
  trader_id BIGINT NOT NULL REFERENCES traders(id),
  market_id BIGINT NOT NULL REFERENCES markets(id),
  outcome_id BIGINT REFERENCES market_outcomes(id),
  trade_side VARCHAR(10) NOT NULL,
  trade_action VARCHAR(20),
  price NUMERIC(20,8) NOT NULL,
  quantity NUMERIC(20,8) NOT NULL,
  notional_usd NUMERIC(20,8),
  fee_usd NUMERIC(20,8),
  traded_at TIMESTAMPTZ NOT NULL,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

권장 인덱스
- `trader_id, traded_at DESC`
- `market_id, traded_at DESC`
- `outcome_id, traded_at DESC`
- `trader_id, market_id`

파티셔닝 권장
- 거래량이 커지면 `traded_at` 기준 월별 파티셔닝 고려

---

### 5.6 positions

현재 또는 특정 계산 시점 기준 주소별 포지션 집계.

```sql
CREATE TABLE positions (
  id BIGSERIAL PRIMARY KEY,
  trader_id BIGINT NOT NULL REFERENCES traders(id),
  market_id BIGINT NOT NULL REFERENCES markets(id),
  outcome_id BIGINT REFERENCES market_outcomes(id),
  snapshot_at TIMESTAMPTZ NOT NULL,
  quantity_open NUMERIC(20,8) NOT NULL DEFAULT 0,
  avg_entry_price NUMERIC(20,8),
  invested_usd NUMERIC(20,8),
  realized_pnl_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
  unrealized_pnl_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trader_id, market_id, outcome_id, snapshot_at)
);
```

사용 목적
- 현 시점 포지션 조회
- 과거 시점 리플레이
- 백테스트 입력 데이터 생성

---

### 5.7 market_resolutions

시장 정산 결과.

```sql
CREATE TABLE market_resolutions (
  id BIGSERIAL PRIMARY KEY,
  market_id BIGINT NOT NULL UNIQUE REFERENCES markets(id),
  winning_outcome_id BIGINT REFERENCES market_outcomes(id),
  resolved_at TIMESTAMPTZ,
  resolution_source VARCHAR(100),
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 5.8 trader_daily_stats

일별 집계 테이블. 리더보드와 차트에서 자주 사용.

```sql
CREATE TABLE trader_daily_stats (
  id BIGSERIAL PRIMARY KEY,
  trader_id BIGINT NOT NULL REFERENCES traders(id),
  stat_date DATE NOT NULL,
  trades_count INT NOT NULL DEFAULT 0,
  markets_traded_count INT NOT NULL DEFAULT 0,
  win_count INT NOT NULL DEFAULT 0,
  loss_count INT NOT NULL DEFAULT 0,
  invested_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
  realized_pnl_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
  unrealized_pnl_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
  roi_pct NUMERIC(10,4),
  avg_holding_minutes NUMERIC(20,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trader_id, stat_date)
);
```

권장 인덱스
- `stat_date`
- `trader_id, stat_date DESC`

---

### 5.9 trader_period_stats

7일, 30일, 90일, 전체기간 등 미리 계산된 랭킹용 통계.

```sql
CREATE TABLE trader_period_stats (
  id BIGSERIAL PRIMARY KEY,
  trader_id BIGINT NOT NULL REFERENCES traders(id),
  period_code VARCHAR(20) NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  trades_count INT NOT NULL DEFAULT 0,
  markets_traded_count INT NOT NULL DEFAULT 0,
  win_rate_pct NUMERIC(10,4),
  realized_pnl_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
  roi_pct NUMERIC(10,4),
  sharpe_like_score NUMERIC(12,6),
  max_drawdown_pct NUMERIC(10,4),
  ranking_score NUMERIC(12,6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trader_id, period_code, from_date, to_date)
);
```

예시 `period_code`
- `7d`
- `30d`
- `90d`
- `all`

---

### 5.10 backtest_runs

백테스트 요청 메타 정보.

```sql
CREATE TABLE backtest_runs (
  id BIGSERIAL PRIMARY KEY,
  run_key UUID NOT NULL UNIQUE,
  run_type VARCHAR(50) NOT NULL,
  base_capital_usd NUMERIC(20,8) NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  trader_selection JSONB NOT NULL,
  config JSONB NOT NULL,
  result_summary JSONB,
  status VARCHAR(30) NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 5.11 backtest_run_items

백테스트 개별 결과 저장.

```sql
CREATE TABLE backtest_run_items (
  id BIGSERIAL PRIMARY KEY,
  backtest_run_id BIGINT NOT NULL REFERENCES backtest_runs(id),
  trader_id BIGINT REFERENCES traders(id),
  market_id BIGINT REFERENCES markets(id),
  event_date DATE,
  action_type VARCHAR(30),
  capital_before_usd NUMERIC(20,8),
  capital_after_usd NUMERIC(20,8),
  pnl_usd NUMERIC(20,8),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 5.12 watchlists

관심 트레이더 묶음. 초기에는 익명 세션 기반도 가능하고, 추후 회원 기능 붙일 수 있다.

```sql
CREATE TABLE watchlists (
  id BIGSERIAL PRIMARY KEY,
  owner_type VARCHAR(30) NOT NULL,
  owner_id VARCHAR(100),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 5.13 watchlist_items

```sql
CREATE TABLE watchlist_items (
  id BIGSERIAL PRIMARY KEY,
  watchlist_id BIGINT NOT NULL REFERENCES watchlists(id),
  trader_id BIGINT NOT NULL REFERENCES traders(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (watchlist_id, trader_id)
);
```

---

## 6. 보조 테이블 권장안

성능과 운영 편의성을 위해 아래 보조 테이블을 고려한다.

### 6.1 market_price_snapshots
- 시점별 가격 저장
- 차트용
- 백테스트 리플레이용

### 6.2 trader_category_stats
- 정치/경제/스포츠 등 카테고리별 성과
- 트레이더 강점 분석용

### 6.3 ingestion_jobs
- 수집 작업 상태 관리
- 마지막 성공 시점, 에러 메시지, 재시도 카운트 기록

### 6.4 data_quality_flags
- 비정상 거래, 누락 데이터, 정산 불일치 감지

---

## 7. 논리 ERD 텍스트 버전

```text
events (1) ───< markets (N) ───< market_outcomes (N)
                     │
                     ├────< trades (N) >──── traders (1)
                     │             │
                     │             └────< trader_daily_stats / trader_period_stats
                     │
                     ├────< positions (N)
                     │
                     └──── market_resolutions (1)

backtest_runs (1) ───< backtest_run_items (N)
watchlists (1) ───< watchlist_items (N) >──── traders (1)
```

---

## 8. 데이터 흐름 설계

### 8.1 수집 파이프라인

1. 시장 목록 동기화
2. 신규 market/event/upcome upsert
3. 체결 데이터 수집
4. trader 주소 신규 발견 시 traders upsert
5. trades 저장
6. 일정 주기로 positions 재계산
7. 종료 시장 정산 결과 반영
8. 일간/기간 통계 집계
9. 캐시/리더보드 갱신

### 8.2 배치 권장 주기

- 시장 목록: 5~10분
- 가격 스냅샷: 10초~1분
- 거래 이벤트: 5~30초
- 포지션 재계산: 1~5분
- 일간 통계: 하루 1회 + 필요 시 증분 갱신
- 기간별 리더보드: 10분~1시간

---

## 9. API 설계 초안

프론트엔드에서 사용할 내부 서비스 API 초안이다.

### 9.1 리더보드

#### `GET /api/leaderboard`
쿼리 예시
- `period=30d`
- `sort=ranking_score`
- `category=politics`
- `minTrades=20`
- `page=1&pageSize=50`

응답 예시 필드
- traderId
- walletAddress
- displayName
- roiPct
- winRatePct
- realizedPnlUsd
- marketsTradedCount
- rankingScore

---

### 9.2 트레이더 상세

#### `GET /api/traders/:traderId`
응답 예시
- 기본 프로필
- 최근 성과 요약
- 기간별 수익률
- 최근 거래 목록
- 카테고리별 성과
- 보유 포지션 요약
- 최대 낙폭

#### `GET /api/traders/:traderId/equity-curve`
- 기간별 누적 손익 곡선 데이터 반환

#### `GET /api/traders/:traderId/trades`
- 거래 목록 페이징 조회

---

### 9.3 시장 상세

#### `GET /api/markets/:marketId`
- 시장 질문
- 상태
- 가격 추이
- 유동성/거래량
- 주요 참여자

#### `GET /api/markets/:marketId/top-traders`
- 해당 시장에서 활동한 상위 주소 랭킹

---

### 9.4 백테스트

#### `POST /api/backtests`
요청 예시

```json
{
  "startAt": "2025-12-01T00:00:00Z",
  "endAt": "2026-03-01T00:00:00Z",
  "baseCapitalUsd": 1000,
  "traderIds": [101, 202, 303],
  "allocationMode": "equal_weight",
  "copyDelaySeconds": 60,
  "maxBetPerTradeUsd": 50,
  "slippageBps": 50
}
```

#### `GET /api/backtests/:runKey`
- 실행 결과 요약
- 누적 자산곡선
- 일자별 PnL
- 트레이더별 기여도
- 거래별 상세 결과

---

## 10. 화면설계 상세

### 10.1 메인 대시보드

목적
- 서비스 첫 진입 시 전체 흐름을 보여준다.

구성 요소
- 상단 KPI 카드
  - 추적 중 트레이더 수
  - 오늘 신규 거래 수
  - 최근 30일 상위 수익률 트레이더
  - 오늘 종료 예정 시장 수
- 최근 핫 트레이더 섹션
- 최근 급상승 카테고리 섹션
- 최신 거래 피드
- 백테스트 빠른 실행 카드

권장 레이아웃
- 상단 4개 KPI 카드
- 중단 좌측: 리더보드 미리보기
- 중단 우측: 거래 피드/시장 이슈
- 하단: 카테고리/백테스트 요약

---

### 10.2 리더보드 화면

목적
- 다양한 기준으로 트레이더를 탐색한다.

필터 영역
- 기간: 7일 / 30일 / 90일 / 전체
- 카테고리
- 최소 거래 수
- 최소 투자금
- 최근 활동 여부

정렬 기준
- ranking score
- roi
- realized pnl
- win rate
- max drawdown 낮은 순

테이블 컬럼 예시
- 순위
- 주소/이름
- 최근 30일 ROI
- 승률
- 거래 수
- 시장 수
- 누적 손익
- 최근 활동 시각
- 즐겨찾기 버튼

추가 UX
- 주소 hover 시 요약 툴팁
- 비교함에 추가 버튼

---

### 10.3 트레이더 상세 화면

목적
- 한 트레이더의 성과와 성향을 깊게 분석한다.

상단 헤더
- 주소
- 별칭
- 최근 활동 여부
- 즐겨찾기
- 비교함 추가
- 백테스트 바로 실행

탭 구성 예시
1. 개요
2. 거래 내역
3. 보유/종료 포지션
4. 카테고리 분석
5. 따라갔을 때 수익률

개요 탭 구성
- KPI 카드
  - 30일 ROI
  - 90일 ROI
  - 승률
  - 누적 손익
  - 거래 횟수
  - 최대 낙폭
- 누적 자산곡선 차트
- 월별 성과 바차트
- 카테고리 도넛 차트
- 최근 주요 거래 목록

거래 내역 탭
- 거래 시각
- 시장명
- outcome
- buy/sell
- 수량
- 가격
- 추정 손익

따라갔을 때 수익률 탭
- 시작일 선택
- 초기자본 입력
- 추종 지연 입력
- 슬리피지 입력
- 거래당 최대금액 입력
- 결과 차트/표 표시

---

### 10.4 시장 상세 화면

목적
- 특정 시장에서 누가 어떻게 거래했는지 본다.

구성 요소
- 시장 질문 / 상태 / 종료일 / 정산여부
- 가격 추이 차트
- 유동성 / 거래량 KPI
- 주요 참여 트레이더 랭킹
- 시간대별 거래 히트맵
- 최근 거래 피드

---

### 10.5 비교 분석 화면

목적
- 여러 트레이더를 동시에 비교한다.

구성 요소
- 비교 대상 2~5명 선택
- 공통 기간 선택
- 지표 비교 테이블
- 누적 수익률 비교 차트
- 카테고리별 강점 비교
- 겹치는 시장 참여 비율

---

### 10.6 백테스트 시뮬레이터 화면

목적
- 특정 트레이더 또는 여러 트레이더를 추종했을 경우의 성과를 검증한다.

입력 패널
- 트레이더 선택
- 시작일 / 종료일
- 초기 자본
- 추종 방식
  - 동일 비중
  - 거래 비율 비례
  - 상한 금액 고정
- 지연 시간
- 슬리피지
- 거래당 최대 투입금
- 카테고리 제한

출력 패널
- 최종 자산
- 총 수익률
- MDD
- 승률
- 거래 수
- 일별 자산 곡선
- 트레이더별 기여도
- 거래별 결과 표

---

## 11. 백테스트 로직 상세

### 11.1 기본 아이디어

“특정 트레이더를 N초 지연으로 따라갔을 때”를 가정한다.

입력값 예시
- 시작 자본 1,000달러
- 트레이더 A 추종
- 최대 거래당 50달러
- 복사 지연 60초
- 슬리피지 0.5%

계산 흐름
1. 선택 기간 내 대상 trader의 trade 추출
2. 추종 가능한 거래만 필터링
3. 각 거래 시점에 지연과 슬리피지 반영
4. 자본 제약 반영
5. 종료/정산 시 손익 반영
6. 누적 곡선 계산

### 11.2 주의사항

- 실제 체결 가능 가격과 차이 존재
- 유동성 부족 시장 왜곡 가능
- 거래 일부 누락 시 성과 과대/과소 추정 가능
- 동일 시장 연속 진입/청산 해석 로직 명확화 필요

### 11.3 권장 결과 지표

- 총 수익률
- CAGR 유사 지표
- 승률
- 최대 낙폭
- 변동성
- 일평균 손익
- 샤프 유사 점수

---

## 12. 성능 및 운영 고려사항

### 12.1 캐시 전략

캐시 권장 대상
- 리더보드 상위 100명
- 메인 대시보드 KPI
- 트레이더 상세 요약 카드
- 자주 조회되는 시장 상세

Redis 예시 TTL
- 메인 KPI: 30초~2분
- 리더보드: 1~5분
- 상세 차트: 1~10분

### 12.2 대용량 처리

- trades 테이블 파티셔닝
- 집계 테이블 사전 계산
- 비동기 배치 사용
- 오래된 차트 데이터 다운샘플링

### 12.3 장애 대응

- 수집 지연 모니터링
- 동일 거래 중복 삽입 방지
- 원천 데이터 raw_payload 보존
- 집계 재생성 스크립트 제공

---

## 13. 기술 스택 제안

### 13.1 백엔드
- Python FastAPI 또는 Node.js NestJS
- PostgreSQL
- Redis
- Celery/RQ 또는 BullMQ

### 13.2 프론트엔드
- Next.js
- TypeScript
- Tailwind CSS
- 차트 라이브러리 (ECharts / Recharts 등)

### 13.3 인프라
- Docker
- VPS 또는 클라우드 VM
- 추후 managed PostgreSQL 고려
- 로그 수집 및 알림 시스템

---

## 14. 개발 우선순위

### 14.1 1차 개발
- markets / traders / trades 저장
- 기본 리더보드
- 트레이더 상세 페이지
- 일간/기간 통계 집계

### 14.2 2차 개발
- 백테스트 시뮬레이터
- 비교 화면
- 카테고리 분석
- 관심 트레이더 기능

### 14.3 3차 개발
- 실시간 알림
- 사용자 계정 기능
- 반자동 카피베팅 준비용 구조 추가

---

## 15. 향후 확장 포인트

실제 거래 기능을 붙일 경우 추가 엔티티가 필요하다.

추가 후보 테이블
- `users`
- `user_wallet_connections`
- `copy_strategies`
- `copy_strategy_targets`
- `orders`
- `order_executions`
- `risk_rules`
- `alert_rules`

즉, 현재 문서는 **모니터링 중심 아키텍처**이며, 거래 기능은 별도 모듈로 확장하는 것이 바람직하다.

---

## 16. 최종 정리

본 서비스의 MVP는 공개 데이터 중심으로 충분히 구축 가능하다.

핵심은 아래 3가지다.

1. `trades` 중심의 팩트 테이블 설계가 가장 중요하다.  
2. `trader_daily_stats`, `trader_period_stats` 같은 집계 테이블이 화면 성능을 좌우한다.  
3. 백테스트는 “실제 추종 가능성”을 반영하기 위해 지연, 슬리피지, 최대금액 제약을 반드시 포함해야 한다.  

초기 개발은 다음 순서가 가장 현실적이다.

- 시장/트레이더/거래 수집
- 랭킹 및 상세 조회
- 기간별 집계
- 백테스트
- 알림/비교 기능
- 이후 사용자 인증 기반 확장

---

## 17. 후속 문서 추천

다음 단계에서 추가로 만들면 좋은 문서들

- API 명세서(OpenAPI 초안)
- 배치/크롤러 작업 명세서
- 백테스트 계산 정의서
- 관리자 페이지 기획서
- 사용자 스토리 / 유스케이스 문서
- 프론트엔드 컴포넌트 명세서


---

## 18. 현재 로컬 MVP 스키마 반영 메모 (2026-03-14)

이 문서는 확장형 ERD 초안이다. 현재 저장소의 실제 로컬 MVP 스키마는 아래 SQLite 테이블을 기준으로 동작한다.

### 현재 실제 SQLite 테이블
- `snapshot_meta`
- `traders_current`
- `signals_current`
- `markets_current`
- `watchlist_targets`
- `alerts`
- `sync_runs`

### watchlist 실제 스키마 차이
현재 구현은 `watchlists`, `watchlist_items` 2단계 구조가 아니라 단일 `watchlist_targets` 테이블을 사용한다.
또한 아래 규칙 필드를 `prefs_json` 으로 저장한다.
- `minSizeUsd`
- `minForecastScore`
- `alertMode`

### 시장 상세 UI 실제 범위
현재 UI는 아래를 제공한다.
- 시장별 참여 트레이더 요약
- 최근 시그널 목록
- 최근 1주 가격 차트
- 연결된 대표 asset 표시

### 백테스트 UI 실제 범위
현재 UI는 비동기 백테스트 실행 큐가 아니라 즉시 조회형 단일 API를 사용한다.
- `GET /api/traders/:id/backtest`

### 문서 적용 기준
향후 PostgreSQL 기반 정규화 ERD로 확장하더라도, 현재 MVP 동작 확인은 로컬 SQLite 스키마와 실제 API를 우선 기준으로 삼는다.
