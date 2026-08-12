# V248 R3 AdminPlus Orderer Parity Fix

- AdminPlus 공식 주문등록 필드 `orderer_name`, `orderer_hp`, `orderer_tel` 사용
- 주문자: 소신채 / 010-6880-9413 서버 고정
- 수령인/수령인 연락처/주소: 마켓 실제 구매자 정보 유지
- 기존 잘못된 `order_name`, `order_phone` payload 제거
- V248 R2 050 가상번호 mirror, V248 주문/결제 분리, V247 송장 복구 유지
