# V248 R5 Shipment Source-of-Truth Fix

- 지정시간 송장 자동화 유지.
- 송장 회수 source of truth를 purchaseHistory 후보가 아니라 현재 AdminPlus 주문의 실제 courier+trackingNo 증거로 변경.
- 입금전/draft 주문은 legacy 직접조회 후보에서 제외.
- current orders scan -> marketplace history linkage -> changed-order/direct fallback 순서.
- V248 R4 시간정책, R3 주문자, R2 가상번호, V247 송장등록 안전장치 유지.
