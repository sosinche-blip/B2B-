# V223 AdminPlus 주문등록/복구 수정 검증보고서

## 화면 근거
- 수집 19건 (쿠팡 17, 토스 2)
- 후보 5건, 실행가능 5건
- 신규 0건
- 이미 발주됨 11건, 계정 미연결/자동발주 OFF 3건

따라서 수집/매핑/중복필터 이후의 AdminPlus 주문등록 단계에서 실패한 상태로 판단했습니다.

## 수정
1. 주문등록 응답을 `data.orders` 하나로 고정하지 않고 중첩 객체에서 customer_order_code/order code/order_key/total_amount를 안전하게 탐색합니다.
2. 응답에 주문코드가 없으면 customer_order_code로 0/0.7/1.8초 지연 재조회합니다.
3. 배치 요청 자체가 실패한 경우에만 미등록 행을 1건씩 재시도합니다.
4. 배치 HTTP 성공인데 확인이 안 되는 경우는 중복 방지를 위해 재POST하지 않습니다.
5. 웹 화면에서 summary.errors 상위 3건을 주문번호/단계/사유와 함께 표시합니다.

Revision: `adminplus-create-reconcile-v223-20260809`
