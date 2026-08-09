# V220 쿠폰 상태복구 + 토스 자동발주 연결 보강

## 1. 쿠폰 24시간 반복대상 상태 오류
- `지금 쿠폰 교체`는 Worker에서 requestedId 상태와 실제 APPLIED 쿠폰/옵션까지 교차검증합니다.
- 기존 UI는 성공 뒤에도 `preflightStatus=미검증`으로 덮어써 실제 쿠폰이 정상 등록돼도 `미검증/확인필요`로 보일 수 있었습니다.
- V220은 성공 즉시 `preflightStatus=통과`, `preflightAt=현재시각`, `preflightIssues=[]`로 저장합니다.
- 자동운영 사용 중이면 `automationState=active`, 아직 시작 전이면 `validated`로 복구합니다.

## 2. 토스 수집→AdminPlus 자동발주 단절
- 토스 주문의 stockId와 상품 API productItemId가 다른 경우 V219 bridge를 우선 사용합니다.
- 추가로 V220/V211은 토스 상품상세 응답에서 `stocks[]`가 success/data/result/product 등 어느 래퍼에 있어도 실제 상품 객체를 찾습니다.
- 엑셀 productItemId 매핑을 찾은 뒤, 과거 AdminPlus 확정링크가 stockId/관리코드 기준으로 남아 있어도 동등 토스 식별자 후보에서 기존 확정링크를 찾습니다.
- 정확한 `채널|엑셀 optionId` 링크가 항상 1순위이며, alias fallback은 토스에만 적용합니다.
- 중복발주 history key, 기본수량 검증, 두 번째 발주시간 중복차단은 그대로 유지합니다.

## 확인 리비전
- featureRevision: option-baseqty-confirm-v217-20260809
- hotfixRevision: single-adminplus-option-v218-20260809
- tossBridgeRevision: toss-stock-productitem-v219-20260809
- couponStateRevision: coupon-actual-applied-state-v220-20260809
- tossAutoPurchaseRevision: toss-confirmed-link-alias-v220-20260809

## 배포 순서
1. Ncloud V211 배포
2. `/api/system/status`에서 위 V220 revision 2개 확인
3. V220 웹/Cloudflare Worker를 GitHub main에 반영
4. GitHub Actions Verify/Deploy 성공 확인
5. Cloudflare Pages Production 성공 후 Ctrl+F5

## 운영 검증
### 쿠폰
1. `미검증` 또는 `확인필요` 행에서 `지금 쿠폰 교체`
2. 실제 쿠팡 신규 쿠폰 APPLIED 확인
3. 화면이 자동으로 `운영중` 또는 `자동운영 준비완료`로 변경되는지 확인
4. 새로고침 후에도 `통과` 유지 확인

### 토스
1. PAID 주문 1건 수집
2. 진단에서 stockId와 productItemId 연결 확인
3. 엑셀 optionId 또는 기존 alias 확정링크 검색 확인
4. 발주시간 도래 시 AdminPlus 주문등록 이력 생성 확인
5. 두 번째 발주시간에는 동일 주문 중복등록되지 않는지 확인
