# V218 AdminPlus 단일옵션 자동확정 핫픽스 검증

## 직접 원인
- 화면 오류: 요청 상품 10001696 / 옵션 0 / 수량 5, 재조회 상품 10001696 / 옵션 1484 / 수량 5.
- 상품과 수량은 정상 저장됐지만 기존 B2B 링크의 AdminPlus optionCode가 비어 있어 POST에서 option_code를 생략했고, AdminPlus가 실제 유일 옵션 1484를 반환했습니다.
- 기존 검증기는 생략된 옵션을 숫자 0으로 바꿔 1484와 엄격 비교해 정상 저장을 실패로 오판했습니다.

## 1차 — UI 단일옵션 해석
- 기존 optionCode가 비어 있고 AdminPlus 상품 옵션이 정확히 1개이면 그 옵션 자동복구: PASS
- 옵션이 2개 이상이면 임의선택 금지, 사용자 정확 선택 요구: PASS
- 수정 확정 시 resolved optionCode를 POST/검증/서버 링크에 동일하게 사용: PASS
- 기존 서버 링크 optionCode가 비어 있어도 단일옵션이면 실제 코드로 복구: PASS

## 2차 — Worker 저장 후 검증
- option_code 생략 요청과 명시 요청을 구분: PASS
- 명시 옵션은 기존처럼 정확 일치 검증: PASS
- 생략 옵션은 상품/수량 일치 시 AdminPlus resolved option을 허용: PASS
- 실제 resolvedOptionCode를 응답 summary에 반환: PASS
- `hotfixRevision = single-adminplus-option-v218-20260809`: PASS

## 3차 — 회귀/발주 안전성
- V214 mapping edit persistence: PASS
- V215 dual time/server lock/B alert: PASS
- V216 confirmed match/time commit: PASS
- V217 Excel optionId/baseQty source-of-truth: PASS
- V217 R1 Worker type hotfix: PASS
- Ncloud option/baseQty/confirmed match/dual time/mapping edit 회귀검증: PASS
- Excel 마켓 optionId는 채널+optionId 확정 링크 키로 유지: PASS
- Excel baseQty와 AdminPlus per-option qty 불일치 시 자동발주 차단 유지: PASS

## 구분해야 할 ID
- `95235689038` 등: 쿠팡/엑셀 옵션ID (B2B 기준키)
- `1484`: AdminPlus 상품 내부 옵션코드
- 두 ID는 서로 다른 시스템의 키이므로 숫자를 같게 만들지 않습니다.
- B2B 서버는 엑셀 optionId/baseQty를 기준으로 하고, AdminPlus 옵션코드는 실제 상품 선택에만 사용합니다.

## 환경 제한
- 내부 npm 미러가 `zod@4.4.3` tarball을 404로 반환해 로컬 `npm ci` 기반 GitHub 동일 typecheck는 실행하지 못했습니다.
- 기존 소스 회귀검증과 V218 신규 검증은 모두 PASS했습니다.
