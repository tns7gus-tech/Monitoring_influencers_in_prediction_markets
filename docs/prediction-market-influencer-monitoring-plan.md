# 예측시장 인플루언서 모니터링 서비스 기획서

## 1. 프로젝트 개요

### 목적
- 폴리마켓, 칼시 같은 예측시장에서 성과가 좋은 트레이더를 찾는다.
- 그들이 과거에 어떤 포지션을 잡았고, 현재 어떤 포지션을 보유 중인지 모니터링한다.
- 해당 트레이더를 그대로 카피베팅했을 때의 가상 수익률을 계산해 직관적으로 보여준다.

### 한 줄 결론
- **MVP는 Polymarket 중심으로 시작하는 것이 현실적이다.**
- **"승률"은 단순 적중률이 아니라, 실현 수익률과 표본 신뢰도를 포함한 복합 점수로 정의해야 한다.**
- **추적 대상의 "미체결 주문"까지 보는 것은 어렵고, 실제 체결된 거래와 현재 보유 포지션 중심으로 모니터링해야 한다.**

## 2. 왜 단순 승률로는 부족한가

예측시장에서는 "맞췄는가"만으로 좋은 트레이더를 판별하면 왜곡이 크다.

예시:
- A는 10번 중 9번 맞췄지만 모두 0.90 이상 가격에서 진입했다면 기대수익이 낮을 수 있다.
- B는 10번 중 6번만 맞췄지만 0.20~0.35 구간에서 진입해 큰 기대값을 만들 수 있다.
- C는 결과적으로 틀린 시장이어도, 중간 가격 상승 구간에서 익절해 수익을 냈을 수 있다.

즉, 이 서비스는 아래 두 축을 분리해서 봐야 한다.

### 1) 예측 정확도
- 최종 해상 결과 기준으로 얼마나 자주 맞췄는가

### 2) 트레이딩 성과
- 언제 들어가고 언제 나왔는지까지 포함해서 실제로 돈을 벌었는가

## 3. 핵심 가설

### 가설 1
최근 30~90일 동안 일관되게 성과가 좋은 트레이더는 존재한다.

### 가설 2
그들의 신규 포지션 진입 또는 포지션 확대를 빠르게 추적하면, 일정 지연을 감안해도 카피베팅 성과가 발생할 수 있다.

### 가설 3
사용자는 "누가 잘하는가"보다도 아래 질문에 더 큰 가치를 느낀다.
- 지금 누가 어떤 시장에 들어갔는가
- 그 사람을 따라 했으면 과거 수익률이 어땠는가
- 지금 따라 들어가도 늦지 않았는가

## 4. 플랫폼별 데이터 접근 현실성

### Polymarket
- 공식 문서 기준으로 `Gamma API`와 `Data API`는 공개 조회가 가능하다.
- 사용자별 `positions`, `closed-positions`, `activity`, `trades`, `leaderboard`, `holders`, `market-positions` 조회가 가능하다.
- 따라서 **지갑 주소 기준 트레이더 추적 서비스 구현이 가능하다.**

### Kalshi
- 공식 문서 기준으로 공개 시장 데이터는 볼 수 있다.
- 하지만 `portfolio`, `fills`, `positions`는 로그인한 본인 계정 기준 API다.
- 공개 트레이드 스트림은 있어도 상대 사용자 식별 정보가 없다.
- 따라서 **제3자 트레이더를 Polymarket처럼 추적하는 서비스는 Kalshi에서 동일 방식으로 구현하기 어렵다.**

### 제품 전략 결론
- **1단계: Polymarket 단독 MVP**
- **2단계: Kalshi는 시장 데이터 대시보드 또는 본인 계정 연동형 분석 기능으로 분리**

## 5. "승률이 높은 아이디"를 어떻게 정의할 것인가

### 잘못된 정의
- 단순 적중률 = 이긴 시장 수 / 전체 시장 수

이 방식은 표본 수, 진입 가격, 익절 여부, 포지션 규모를 반영하지 못한다.

### 추천 정의: 트레이더 점수 체계

#### A. Forecast Score
최종 해상 기준 예측 정확도

구성:
- 해상된 시장 기준 적중률
- 진입 금액 가중 적중률
- 평균 진입 가격 대비 기대값
- 시장 수 최소 조건

#### B. Trading Score
실제 트레이딩 성과

구성:
- 실현 손익 합계
- 실현 ROI
- 평균 손익률
- 최대 낙폭
- 승/패 거래 비율

#### C. Reliability Score
표본의 신뢰도

구성:
- 최근 90일 해상 시장 수
- 최근 90일 총 거래대금
- 활동 주기
- 특정 카테고리 편중 여부

### 최종 추천 점수

```text
Influencer Score =
0.35 * normalized_realized_roi_90d +
0.25 * size_weighted_hit_rate_90d +
0.20 * realized_pnl_90d +
0.10 * sample_reliability +
0.10 * recency_consistency
```

### 최소 필터 조건
- 최근 90일 해상 시장 20개 이상
- 최근 90일 누적 거래대금 5,000달러 이상
- 최근 30일 활동일 10일 이상
- 특정 단일 시장 수익에 과도하게 의존하지 않을 것

## 6. 서비스에서 보여줄 핵심 지표

트레이더 카드에 아래 지표를 함께 보여주는 것이 좋다.

- 최근 30일 실현 PnL
- 최근 90일 실현 ROI
- 해상 시장 기준 적중률
- 금액가중 적중률
- 현재 오픈 포지션 수
- 현재 오픈 포지션 평가손익
- 최근 신규 진입 시장
- 카피베팅 백테스트 수익률

## 7. 추적 방법: 어떤 식으로 접근해야 하는가

### 단계 1. 후보 트레이더 풀 수집

Polymarket에서 아래 방식으로 후보군을 만든다.

#### 방법 A. 리더보드 기반 수집
- 공식 `leaderboard`에서 최근 `DAY`, `WEEK`, `MONTH`, `ALL` 상위 트레이더를 수집
- 장점: 빠르게 상위 유저 풀 확보 가능
- 단점: 단기 PnL 노이즈가 섞일 수 있음

#### 방법 B. 대형 포지션 보유자 기반 수집
- 활성 시장의 `holders` 또는 `market-positions`를 조회
- 각 시장에서 큰 금액을 베팅한 지갑을 후보군에 추가
- 장점: 리더보드 외 숨은 고수 발견 가능

#### 방법 C. 거래 이력 확장 수집
- 특정 시장 `trades` 또는 사용자 `activity`를 기반으로 반복 등장 지갑을 수집
- 장점: 실제 활동성이 높은 유저를 뽑기 좋음

### 단계 2. 사용자별 과거 이력 적재

후보 지갑마다 아래 데이터를 백필한다.

- 현재 포지션
- 종료된 포지션
- 거래 이력
- 활동 로그
- 시장별 진입 시점, 평균 단가, 청산 시점, 실현 손익

이 데이터를 바탕으로 사용자별 성과 팩트를 계산한다.

### 단계 3. 사용자 스코어링

각 사용자에 대해 아래를 계산한다.

- 최근 7일, 30일, 90일 PnL
- ROI
- 적중률
- 금액가중 적중률
- 평균 보유기간
- 카테고리별 성과
- 변동성 및 낙폭

### 단계 4. 실시간/준실시간 모니터링

사용자별로 주기적으로 아래를 폴링한다.

- `activity`
- `positions`
- `trades`

변화 감지 규칙:
- 새로운 시장 진입
- 기존 포지션 추가 매수
- 포지션 축소
- 전량 청산

### 단계 5. 시그널 생성

사용자에게 보여줄 이벤트 예시:
- `A 트레이더가 트럼프 YES를 0.41에 신규 진입`
- `B 트레이더가 BTC 100k YES 포지션을 2배 확대`
- `C 트레이더가 기존 NO 포지션 70% 청산`

## 8. 중요한 구현 현실: 무엇을 추적할 수 있고, 무엇은 못 보는가

### 추적 가능한 것
- 특정 지갑의 과거 거래
- 특정 지갑의 현재 보유 포지션
- 포지션 증가/감소
- 해상된 시장의 결과와 손익

### 추적이 어려운 것
- 아직 체결되지 않은 주문
- 사용자의 의도만 있고 실행되지 않은 전략
- 오프체인 메모나 외부 판단 근거

즉, 서비스 문구는 "앞으로 어떤 배팅을 하고 있는지"보다 아래 표현이 정확하다.

- 현재 어떤 포지션을 보유 중인지
- 최근 어떤 포지션을 새로 잡았는지
- 최근 어떤 포지션을 늘리거나 줄였는지

## 9. 카피베팅 백테스트 설계

이 서비스의 차별점은 "유저 추적"이 아니라 **카피했을 때 실제로 벌 수 있었는지**를 검증하는 데 있다.

### 백테스트 기본 규칙
- 인플루언서의 신규 진입 이벤트를 감지한다.
- 추종자는 일정 지연 후 같은 시장에 진입한 것으로 가정한다.
- 추종자는 동일 금액 또는 비율 금액으로 진입한다.
- 청산 규칙도 동일하게 따라가거나, 시장 해상까지 보유하는 두 시나리오를 나눈다.

### 반드시 비교할 3개 시나리오
- 즉시 카피: 1분 이내 진입
- 지연 카피: 10분 또는 1시간 후 진입
- 종가 카피: 당일 마지막 가격으로 진입

### 백테스트 지표
- 누적 수익률
- MDD
- 승률
- 평균 수익/손실
- 거래당 기대수익
- 샤프 비슷한 위험조정 지표

### 매우 중요한 점
인플루언서가 0.32에 진입했고 사용자는 0.45에 따라 들어갔다면, 같은 방향이어도 성과는 크게 달라진다.

따라서 카피베팅은 반드시 아래를 반영해야 한다.
- 체결 지연
- 슬리피지
- 수수료
- 유동성 부족

## 10. 추천 데이터 모델

### 주요 엔티티
- `markets`
- `traders`
- `trader_positions`
- `trader_trades`
- `trader_daily_stats`
- `signals`
- `copytrade_backtests`

### 핵심 관계
- 한 명의 `trader`는 여러 `trader_trades`와 `trader_positions`를 가진다.
- 하나의 `market`에는 여러 `signals`가 발생할 수 있다.
- 하나의 `trader`는 기간별 `trader_daily_stats`를 가진다.

## 11. 화면 기획 초안

### 1) 메인 대시보드
- 오늘 가장 주목할 트레이더
- 최근 24시간 신규 진입 시그널
- 최근 카피베팅 성과 상위 트레이더

### 2) 트레이더 상세
- 최근 성과 요약
- 과거 거래 타임라인
- 현재 보유 포지션
- 카테고리별 강점
- 카피베팅 백테스트 차트

### 3) 시장 상세
- 해당 시장에 들어온 상위 트레이더 목록
- YES/NO별 주요 지갑 분포
- 최근 대형 포지션 변화

### 4) 알림
- 특정 트레이더 신규 진입
- 특정 시장에 상위 트레이더 3명 이상 동시 진입
- 특정 트레이더 포지션 급확대/급축소

## 12. MVP 범위 제안

### MVP에서 반드시 포함
- Polymarket 트레이더 수집
- 상위 트레이더 점수 산출
- 트레이더 상세 페이지
- 현재 포지션 모니터링
- 신규 시그널 피드
- 카피베팅 백테스트

### MVP에서 제외해도 되는 것
- Kalshi 타 사용자 추적
- 자동 실거래 카피 주문
- 복잡한 소셜 기능
- AI 코멘터리 생성

## 13. 권장 개발 순서

### 1주차
- Polymarket 데이터 수집기 구축
- 시장/유저/거래 기본 스키마 설계

### 2주차
- 사용자 성과 산출 배치 구현
- 트레이더 스코어링 로직 구현

### 3주차
- 시그널 감지 로직 구현
- 카피베팅 시뮬레이터 구현

### 4주차
- 웹 대시보드 구현
- 트레이더 상세/알림/차트 연결

## 14. 가장 현실적인 실행 전략

### 추천 전략
- 처음부터 "폴리마켓 + 칼시 통합 인플루언서 추적기"로 가지 않는다.
- **Polymarket에서만 완전한 추적 경험을 먼저 만든다.**
- 사용자 반응과 데이터 품질이 검증되면 Kalshi는 별도 모듈로 붙인다.

### 이유
- Polymarket은 공개 사용자 데이터가 있어 추적 서비스와 궁합이 맞다.
- Kalshi는 공식 문서 기준 제3자 포트폴리오 추적이 제한적이다.
- 제품의 핵심 가치가 "사람 추적"이라면 시작점은 Polymarket이 맞다.

## 15. 바로 실행 가능한 의사결정

지금 당장 결정해야 할 것은 아래 3가지다.

### 결정 1
이 서비스의 1차 대상은 **예측 정확도 높은 사람**으로 확정한다.

이유:
- 사용자 관심사는 "누가 먼저 들어가고, 누가 더 자주 맞추는가"에 가깝다.
- 내부자처럼 보이는 조기 진입 패턴을 탐지하려는 목적과 맞다.
- 수익률은 참고 지표로 유지하되 메인 랭킹 기준은 정확도 중심으로 둔다.

### 결정 2
카피베팅 기준은 무엇인가

권장:
- "신규 진입"과 "포지션 확대"만 시그널로 인정
- 단순 보유 지속은 시그널로 보지 않음

### 결정 3
실시간성 수준은 어느 정도 필요한가

권장:
- MVP는 1~5분 단위 준실시간 폴링
- 실시간 WebSocket 최적화는 2차 과제로 미룸

## 16. 제안하는 최종 방향

이 아이템은 충분히 가능하지만, 핵심은 아래처럼 좁혀야 한다.

### 서비스 정의
"예측시장에서 성과가 검증된 Polymarket 트레이더를 점수화하고, 현재 포지션 변화와 과거 카피베팅 성과를 보여주는 모니터링 웹"

### 핵심 성공 포인트
- 승률 정의를 단순 적중률로 두지 않을 것
- 트레이더 추적 가능 범위를 공개 데이터 기준으로 명확히 할 것
- 카피베팅 성과를 반드시 지연 진입 기준으로 계산할 것
- Polymarket 단일 MVP로 빠르게 검증할 것

## 17. 참고할 공식 문서

- Polymarket API 개요: https://docs.polymarket.com/api-reference
- Polymarket Leaderboard: https://docs.polymarket.com/api-reference/core/get-trader-leaderboard-rankings
- Polymarket User Positions: https://docs.polymarket.com/api-reference/core/get-current-positions-for-a-user
- Polymarket Closed Positions: https://docs.polymarket.com/api-reference/core/get-closed-positions-for-a-user
- Polymarket User Activity: https://docs.polymarket.com/api-reference/core/get-user-activity
- Polymarket Trades: https://docs.polymarket.com/api-reference/core/get-trades-for-a-user-or-markets
- Polymarket Holders: https://docs.polymarket.com/api-reference/core/get-top-holders-for-markets
- Polymarket Market Positions: https://docs.polymarket.com/api-reference/core/get-positions-for-a-market
- Polymarket Subgraph: https://docs.polymarket.com/market-data/subgraph
- Kalshi API 소개: https://docs.kalshi.com/
- Kalshi 공개 시장 데이터 가이드: https://docs.kalshi.com/getting_started/quick_start_market_data
- Kalshi 포트폴리오/포지션 API: https://docs.kalshi.com/typescript-sdk/api/PortfolioApi
- Kalshi 웹소켓 공개 트레이드: https://docs.kalshi.com/websockets/public-trades

## 18. 다음 단계

다음 작업으로 가장 적절한 것은 아래 두 가지 중 하나다.

1. 이 문서를 바탕으로 **기능명세서(PRD) 버전**으로 더 구체화한다.
2. 바로 **MVP 데이터 수집기 구조와 DB 스키마**를 설계한다.


---

## 19. 현재 구현 반영 상태 (2026-03-14)

이 문서는 초기 기획서이므로 아래 현재 구현 범위를 함께 본다.

### 현재 구현 완료 범위
- Polymarket 공개 API 기반 실데이터 동기화
- `leaderboard`, `positions`, `closed-positions`, `activity`, `trades`, `value`, `prices-history` 사용
- 로컬 스냅샷 JSON 저장
- SQLite 기반 현재 상태 저장
- 예측 정확도 중심 랭킹
- 최근 활동 signal feed
- watchlist 저장 및 알림 생성
- 시장별 drill-down과 최근 1주 가격 차트
- 실거래 기반 카피백테스트 API와 UI

### 현재 구현 API
- `GET /api/bootstrap`
- `GET /api/snapshot`
- `GET /api/watchlist`
- `POST /api/watchlist`
- `DELETE /api/watchlist/:wallet`
- `GET /api/alerts`
- `POST /api/alerts/read-all`
- `GET /api/markets`
- `GET /api/markets/:slug`
- `GET /api/traders/:id/backtest`
- `GET /api/sync-status`
- `POST /api/sync`

### watchlist 규칙형 알림
현재 watchlist는 아래 규칙을 함께 저장한다.
- `minSizeUsd`
- `minForecastScore`
- `alertMode = all | high_conviction | new_entries_only`

### 아직 남아 있는 항목
- 사용자 계정/인증
- 실제 주문 실행형 카피베팅
- Kalshi 연동
- 장기 시계열 백테스트 저장 이력
- 백그라운드 작업 큐 분리

### 문서 해석 주의
이 문서에 있는 일부 점수식과 확장 제안은 제품 방향 문서이며, 현재 로컬 MVP 구현은 더 단순한 형태로 축소되어 있다. 실제 동작은 `README.md`, 서버 API, SQLite 스키마, 프론트 UI 구현을 기준으로 본다.
