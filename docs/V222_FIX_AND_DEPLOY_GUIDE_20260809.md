# V222 쿠팡·토스 결제완료 수동발주 큐 복구

## 직접 원인
1. `지금 발주·결제 실행`도 자동 스케줄과 동일하게 `adminplusAutomation.startedAt` 이전 주문을 제외해 현재 ACCEPT/PAID backlog가 후보 0건이 될 수 있었습니다.
2. 수동 실행 API가 브라우저 payload의 mappings/adminplusProductLinks/adminplusPurchaseHistory를 그대로 우선 사용해, 오래 열린 탭의 캐시가 서버 확정값보다 앞설 수 있었습니다.
3. 실행 결과가 `신규 0건`만 보여 후보에서 왜 제외됐는지 운영자가 확인하기 어려웠습니다.

## 수정
- 수동 실행은 startedAt 컷오프를 적용하지 않습니다. 예약 스케줄러만 기존 startedAt 보호를 유지합니다.
- 수동 실행은 서버 저장 mappings/adminplusProductLinks/adminplusPurchaseHistory를 source-of-truth로 사용합니다.
- 수집건수/채널별 수집/후보/실행가능/신규와 제외사유 집계를 응답·화면에 표시합니다.
- V219 Toss stockId→productItemId, V220 confirmed-link alias, V221 PAID fallback은 유지합니다.

## 확인값
- manualPurchaseQueueRevision: `manual-backlog-server-source-v222-20260809`

## 실제 확인
1. 현재 쿠팡 ACCEPT + 토스 PAID 수를 확인합니다.
2. `발주·결제 사전검증`을 먼저 누르면 `수집 n건 / 후보 n건 / 실행가능 n건`이 표시됩니다.
3. `지금 발주·결제 실행` 후 신규 생성 건수와 제외사유를 확인합니다.
4. 이미 발주된 주문은 `이미 발주됨`으로 중복 차단되어야 합니다.
