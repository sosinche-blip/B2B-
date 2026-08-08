# 웹앱 V205 쉬운 배포

1. 현재 GitHub 저장소를 백업합니다.
2. `B2B_OPERATION_MASTER_V205_SAFE_COUPON_SWAP_4_STATUS_20260808` 폴더 안의 파일 전체를 기존 GitHub 저장소 `main` 브랜치에 업로드합니다.
3. GitHub Actions가 성공하는지 확인합니다.
4. Cloudflare Workers & Pages에서 최신 Production 배포가 Success인지 확인합니다.
5. `https://b2b-bpt.pages.dev/`에서 Ctrl+F5 합니다.
6. 상단 버전이 `V205 안전 쿠폰교체·4단계 주문상태 점검본`인지 확인합니다.
7. 오늘운영에서 결제완료 / 상품준비중 / 배송중 / 배송완료 4개 카드만 보이는지 확인합니다.
8. 각 카드를 눌러 숫자와 목록 건수가 같은지 확인합니다.

Ncloud는 먼저 `NCLOUD_FIXED_IP_GATEWAY_V200_SAFE_COUPON_SWAP_ORDER_STATUS.zip`을 배포하고, 상태 API의 version이 `v204-safe-coupon-swap-operation-status`인지 확인합니다.
