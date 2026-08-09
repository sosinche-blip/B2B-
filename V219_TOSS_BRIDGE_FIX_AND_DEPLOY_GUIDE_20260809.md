# V219 토스 stockId → productItemId 자동연결 보강

## 직접 원인
- 토스 주문 API는 주문행 식별에 `stockId`와 `productItemManagementCode`를 제공합니다.
- 토스 상품 API에서 실제 상품 옵션 ID는 `productItemId`이며, 상품 상세의 `stocks[]`에는 `id`(stockId), `itemId`(productItemId), `managementCode`가 함께 존재합니다.
- 기존 Ncloud 자동발주는 주문의 stockId/관리코드를 엑셀 `optionId`와 직접 비교하는 하위호환 경로에 의존해, 엑셀/API 매핑이 productItemId 기준인 경우 토스만 미매핑으로 빠질 수 있었습니다.

## V219/V210 수정
1. 토스 옵션 마스터에 `stockId`와 `productItemId(optionId)`를 별도 보존합니다.
2. 상품 상세 API의 `stocks[].id -> stocks[].itemId`로 stockId→productItemId 브리지를 만듭니다.
3. 웹 수집 주문도 stockId를 기준으로 브리지를 찾은 뒤 `order.optionId`를 productItemId로 정규화합니다.
4. Ncloud 자동발주는 legacy 직접 비교보다 stockId→productItemId 브리지를 먼저 적용합니다.
5. 서버에 브리지가 없으면 주문의 productId로 상품 상세을 1회 조회해 브리지를 자동 보강하고, 같은 스케줄 실행 중 재사용합니다.
6. 브리지로 찾지 못한 과거 자료만 stockId/관리코드 직접 비교 경로를 하위호환으로 사용합니다.
7. 엑셀의 optionId/baseQty 및 옵션별 확정 AdminPlus 링크는 기존 source-of-truth로 유지합니다.
8. 두 번째 발주시간에서도 이미 발주된 주문은 기존 history key로 중복 차단합니다.

## 배포 확인값
- version: `v213-per-option-payment-toss-mapping`
- featureRevision: `option-baseqty-confirm-v217-20260809`
- hotfixRevision: `single-adminplus-option-v218-20260809`
- tossBridgeRevision: `toss-stock-productitem-v219-20260809`

## 배포 순서
1. Ncloud V210 동반 수정본을 먼저 배포합니다.
2. `/api/system/status`에서 위 `tossBridgeRevision`을 확인합니다.
3. V219 웹/Cloudflare Worker를 GitHub main에 반영합니다.
4. GitHub Actions Worker Verify/Deploy가 성공인지 확인합니다.
5. Cloudflare Pages Production 성공 후 웹앱에서 Ctrl+F5 합니다.

## 실제 운영 검증
1. 토스 PAID 주문 1건을 수집합니다.
2. 주문의 원본 `stockId`와 상품 API에서 연결된 `productItemId`가 진단정보에 표시되는지 확인합니다.
3. 해당 productItemId가 엑셀 API 매핑 optionId와 일치하는지 확인합니다.
4. 자동발주 스케줄 실행 후 AdminPlus 주문등록 이력이 생성되는지 확인합니다.
5. 동일 주문이 두 번째 발주시간에 중복 등록되지 않는지 확인합니다.
