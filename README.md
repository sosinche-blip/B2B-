# B2B Operation Master V213

V212 기능을 유지하면서 AdminPlus 자동발주·결제와 Toss 매핑을 보강했습니다.

- 일일 운영 점검판에 `수집완료` 추가
- `수집완료 → 결제완료 → 상품준비중 → 배송중 → 배송완료` 흐름
- Toss 주문 매핑에서 `stockId`, `productItemManagementCode`, 옵션관리코드를 함께 비교
- AdminPlus 업체별 예치금 자동결제 ON/OFF + 1회/일일 한도
- 결제 완료 확인 후에만 쿠팡/토스 상품준비중 전환
- API 상품매칭 자동추천 표에서 옵션ID와 매칭확정 버튼을 붙여 배치
- 추천근거/상태 열 제거, 옵션별 `발주시간` 입력
- 자동화 화면의 전역 발주시간 제거
- Ncloud 관리 토큰은 영구저장하지 않고 `sessionStorage`로 같은 탭 세션 동안 유지

자동결제는 기본 OFF입니다. `payment.read`, `balance.read` 권한 및 예치금 잔액과 결제 한도를 충족해야 실제 결제가 실행됩니다.
