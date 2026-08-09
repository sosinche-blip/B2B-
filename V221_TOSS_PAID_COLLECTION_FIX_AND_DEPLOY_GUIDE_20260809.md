# V221 토스 결제완료(PAID) 주문 수집 보강

## 직접 원인
1. 토스 주문 API 성공 여부는 `resultType=SUCCESS`가 기준인데, 기존 코드는 SUCCESS 응답에 빈/schema용 `error` 객체가 존재하면 실패로 오판할 수 있었습니다.
2. `status=PAID` 조회가 계정/API 응답 차이로 0건을 반환하면 그 즉시 수집 0건으로 종료했습니다.
3. V219/V220의 stockId→productItemId 및 확정링크 alias는 수집된 주문 이후 단계이므로, PAID 주문 자체가 0건이면 자동발주까지 도달할 수 없습니다.

## V221 수정
- resultType SUCCESS/OK이면 error placeholder와 무관하게 성공으로 처리합니다.
- status=PAID 결과가 0건이고 API 호출 자체가 정상일 경우 동일 기간을 status 없이 재조회합니다.
- 전체상태 fallback 결과에서 실제 `orderProductStatus/status=PAID` 주문만 로컬 필터링해 복구합니다.
- 기존 stockId→productItemId bridge, 확정링크 alias, Excel optionId/baseQty, 2회 발주, 중복발주 차단을 유지합니다.
- GitHub V219 검증기의 오래된 `APP_VERSION=V219` 고정 조건을 현재 릴리스에서도 통과하도록 수정했습니다.

## 확인값
- featureRevision: option-baseqty-confirm-v217-20260809
- hotfixRevision: single-adminplus-option-v218-20260809
- tossBridgeRevision: toss-stock-productitem-v219-20260809
- couponStateRevision: coupon-actual-applied-state-v220-20260809
- tossAutoPurchaseRevision: toss-confirmed-link-alias-v220-20260809
- tossPaidCollectionRevision: toss-paid-collection-v221-20260809

## 실제 운영 검증
1. 토스 PAID 주문이 존재하는 날짜에서 주문 수집 실행.
2. `토스 PAID 0건 안전 재조회` 진단이 뜨면 fallback이 실행되었는지 확인.
3. sampleOrders에 토스 PAID 주문이 표시되는지 확인.
4. stockId→productItemId→Excel optionId 매칭 확인.
5. 다음 발주시간 또는 수동 발주에서 AdminPlus 주문등록 이력 확인.
6. 동일 주문이 중복 등록되지 않는지 확인.
