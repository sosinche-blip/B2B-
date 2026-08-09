# B2B V219 토스 stockId → productItemId 자동발주 보강

- 토스 주문 API의 `stockId`와 실제 상품옵션 ID `productItemId`를 별도 식별합니다.
- 상품 상세의 stock 행으로 `stockId -> productItemId` 브리지를 자동 구성합니다.
- 자동발주는 브리지로 productItemId를 구한 뒤 엑셀 API 매핑 optionId와 연결합니다.
- 브리지가 저장되어 있지 않아도 Ncloud 스케줄러가 productId 상품 상세을 조회해 자동 보강합니다.
- 기존 productItemManagementCode/stockId 직접 매핑은 과거 자료 호환용 fallback으로 유지합니다.
- 엑셀 optionId/baseQty, AdminPlus 옵션별 확정, 2회 발주시간, 중복발주 차단은 유지됩니다.
- tossBridgeRevision: `toss-stock-productitem-v219-20260809`
