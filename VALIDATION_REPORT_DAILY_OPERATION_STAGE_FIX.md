# 일일 운영 점검판 단계 수정 검증

기준일: 2026-08-09

## 수정 정의
- 결제완료: 쿠팡 ACCEPT / 토스 PAID 마켓 결제완료 주문
- 수집완료: AdminPlus 주문등록(발주) 성공 이력이 있고 AdminPlus 결제가 아직 완료되지 않은 주문만
- 상품준비중: AdminPlus 결제완료 확인 후 쿠팡 INSTRUCT / 토스 PREPARING_PRODUCT로 전환된 주문
- 이후 배송중 → 배송완료

## 핵심 회귀 방지
1. AdminPlus 발주 이력이 없는 ACCEPT/PAID 주문은 수집완료에 포함하지 않음.
2. AdminPlus 발주 성공 + paymentStatus 대기/실패 주문만 수집완료에 포함.
3. AdminPlus 결제가 완료된 상태는 수집완료에 남기지 않음. 마켓 전환이 완료되면 상품준비중으로 표시.
4. 채널별 '결제완료' 숫자는 AdminPlus 상태와 무관하게 실제 ACCEPT/PAID 전체 건수를 표시.
