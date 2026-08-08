# 웹앱/Worker V212 쉬운 배포

1. `B2B_OPERATION_MASTER_V212_MANUAL_QTY_SHIPPING_COUPON_RECOVERY.zip` 압축을 풉니다.
2. 바깥 폴더가 아니라 안의 파일/폴더 전체를 기존 GitHub 저장소 `main`에 덮어씁니다.
3. GitHub Actions `Deploy Cloudflare Worker`가 초록색 성공인지 확인합니다.
4. Cloudflare Pages 최신 Production 배포가 Success인지 확인합니다.
5. Worker 상태 URL `/api/health`에서 아래 버전을 확인합니다.

```json
{"ok":true,"version":"v212-manual-qty-shipping-coupon-recovery"}
```

6. `https://b2b-bpt.pages.dev/`에서 `Ctrl+F5`.
7. `매핑·발주 → API 상품매칭`에서 기본수량/배송비를 직접 수정 후 저장 시험.
8. 쿠폰은 실제 APPLIED 쿠폰이 없는 반복대상 1건으로 `지금 쿠폰 교체` 시험 후 쿠팡 판매자센터에서 신규 쿠폰의 상품(옵션)수와 APPLIED 상태를 확인합니다.
