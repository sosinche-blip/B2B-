# V248 R2 — AdminPlus 050 가상번호 주문등록 수정

- V248 R1 유지보수 기준에서 기능 구조를 변경하지 않는 hotfix.
- 050 가상번호 수취인 연락처를 receiver_tel/receiver_hp 양쪽에 실제 값 그대로 전달.
- 임의 010 번호를 생성하거나 주문자 번호로 대체하지 않음.
- receiver_hp 검증은 일반 10~11자리와 050 12자리를 허용.
- V233 가상번호 verifier를 현재 AdminPlus 주문 payload 정책으로 정렬.
- V247 송장 reconcile, V248 주문/결제 분리 및 쿠폰 self-healing 유지.
