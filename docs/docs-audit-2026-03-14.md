# Docs Audit 2026-03-14

## 점검 범위
- `prediction-market-influencer-monitoring-plan.md`
- `polymarket_monitoring_plan.md`
- `polymarket_monitoring_erd_ui.md`
- `polymarket_backtest_spec.md`

## 확인 결과
- 큰 누락 1: 현재 구현 상태가 기존 설계 문서들에 거의 반영되지 않았음
- 큰 누락 2: 실제 API 목록이 문서에 정리되어 있지 않거나, 미래형 API와 혼재되어 있었음
- 큰 누락 3: watchlist 규칙형 알림(`minSizeUsd`, `minForecastScore`, `alertMode`)이 문서화되어 있지 않았음
- 큰 누락 4: 현재 SQLite 스키마와 ERD 초안 사이 차이가 명시되지 않았음
- 큰 누락 5: 현재 백테스트가 "최근 거래 표본 기반 MVP"라는 제약이 분명히 적혀 있지 않았음

## 이번 수정 사항
- 각 문서 끝에 `현재 구현 반영` 섹션 추가
- 실제 서버 API 목록 반영
- 실제 SQLite 테이블 구조 반영
- watchlist 규칙형 알림 반영
- 백테스트 현재 지원 범위와 미구현 범위 구분

## 아직 남아 있는 문서 개선 후보
- docs 최상위 인덱스 문서 추가
- API OpenAPI 문서 분리
- 데이터 수집기 운영 가이드 추가
- 배포/운영 체크리스트 추가
- 테스트 전략 문서 분리

## 권장 기준
앞으로는 아래 우선순위로 문서를 본다.
1. `README.md`
2. 실제 서버 API와 SQLite 스키마
3. `docs` 하위 설계 문서

설계 문서는 확장 방향을 설명하고, 현재 동작 정의는 코드와 README를 우선 기준으로 유지한다.
