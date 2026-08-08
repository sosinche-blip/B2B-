# V204 웹앱 쉬운 배포

1. 먼저 Ncloud V200 배포가 성공했는지 `/api/system/status`에서 `v204-safe-coupon-swap-operation-status`를 확인합니다.
2. 현재 GitHub 저장소를 ZIP으로 백업합니다.
3. `B2B_OPERATION_MASTER_V204_SAFE_COUPON_SWAP_ORDER_STATUS.zip`의 압축을 풉니다.
4. 압축을 푼 최상위 폴더 안의 파일/폴더 전체를 현재 GitHub 저장소 `main` 브랜치에 업로드합니다.
5. GitHub Actions 빌드가 성공하는지 확인합니다.
6. Cloudflare Pages/Worker의 최신 Production 배포가 Success인지 확인합니다.
7. 웹앱에서 Ctrl+F5로 새로고침합니다.
8. 상단 버전이 `V204 안전 쿠폰교체·실시간 주문상태 점검본`인지 확인합니다.
9. `오늘운영`에서 `주문상태 새로고침`을 누르고 5개 상태 숫자와 클릭 목록의 건수가 동일한지 확인합니다.
10. 쿠폰 반복대상에서 정상 쿠폰은 자동운영에 맡기고, 조건을 지금 바꿀 때만 `지금 쿠폰 교체`를 사용합니다.
