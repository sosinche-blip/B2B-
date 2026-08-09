# V218 R1 AdminPlus resolved optionCode 확정 보강

## 현재 화면 오류의 직접 원인
- Ncloud V209의 AdminPlus 저장/재조회 검증은 성공하고 실제 `resolvedOptionCode`를 반환합니다.
- 웹앱의 추천 매핑 확정 경로가 카탈로그에서 optionCode를 미리 찾지 못한 경우 빈 문자열을 유지한 채, Ncloud 재조회 결과의 실제 option_code와 다시 엄격 비교하여 성공 응답을 실패로 뒤집었습니다.
- 따라서 Ncloud 성공 → 웹앱 중복검증 실패 → 서버 확정값 미변경 → `자동감시 서버 저장 실패`가 누적될 수 있었습니다.

## 수정
- 추천 매핑 확정: UI optionCode가 비어 있으면 Ncloud `summary.resolvedOptionCode` 또는 재조회 match의 option_code를 최종 확정값으로 채택합니다.
- 최종 확정 링크에도 실제 resolved optionCode를 저장합니다.
- 수동 상품매칭 경로도 Ncloud resolved optionCode를 동일하게 보존합니다.
- 상품코드/수량 검증과 명시적으로 선택한 옵션의 엄격 일치 검증은 유지합니다.
- 성공 저장 payload에서 기존 `adminplus_watch_save` 실패를 해결 상태로 저장하고 UI 경고도 해제합니다.

## 3회 검증
1. suggested-match resolved option propagation: PASS
2. manual-match resolved option propagation: PASS
3. Excel baseQty / 운영실패 해제 / V214~V218 회귀검증: PASS

## TypeScript 구문
- `apps/web/src/App.tsx`: syntax diagnostics 0
- `apps/worker/src/worker.ts`: syntax diagnostics 0

## 배포 범위
- Ncloud V209 재배포 불필요.
- GitHub/Cloudflare 웹앱의 `apps/web/src/App.tsx` 수정이 핵심.
- 기존 V218 검증스크립트도 R1 동작(`let effectiveOptionCode` + resolvedOptionCode 채택)을 허용하도록 수정해야 GitHub Actions verify가 통과합니다.
