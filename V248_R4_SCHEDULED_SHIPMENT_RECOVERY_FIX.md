# V248 R4 지정시간 송장회수 강화

- 지정시간 운영 유지
- 10:00 송장 슬롯 제거
- 23:00 송장 슬롯 추가
- 기존 저장시간에서 10:00은 제거하고 23:00을 자동 보장
- AdminPlus 송장 파서에 invoice/shipment/delivery alias 추가
- direct customer_order_code/order_code 조회와 최근주문 scan fallback 유지
- 송장 미완성 진단에 deepTrackingHint 추가
- V248 R3 주문자 고정, V248 R2 050 가상번호, V248/V247 안전정책 유지
