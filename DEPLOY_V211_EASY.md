# 웹앱/Worker V211 쉬운 배포

## 중요 순서
**Ncloud V204를 먼저 배포하고 `v211-adminplus-shipping-baseqty-cost-watch` 버전을 확인한 뒤 웹앱/Worker V211을 배포합니다.**

1. 현재 GitHub 저장소를 ZIP으로 백업합니다.
2. `B2B_OPERATION_MASTER_V211_SHIPPING_BASEQTY_COST_WATCH.zip`을 풉니다.
3. 바깥 폴더가 아니라 안의 파일/폴더 전체를 기존 GitHub 저장소 `main`에 덮어씁니다.
4. GitHub Actions `Deploy Cloudflare Worker`가 초록색 성공인지 확인합니다.
5. Cloudflare Pages 최신 Production 배포가 Success인지 확인합니다.
6. Worker `/api/health`에서 아래 버전을 확인합니다.

```json
{
  "ok": true,
  "version": "v211-adminplus-shipping-baseqty-cost-watch"
}
```

7. `https://b2b-bpt.pages.dev/`에서 `Ctrl+F5` 합니다.
8. 설정에서 Ncloud 관리 토큰을 다시 입력합니다.
9. AdminPlus 계정 연결·만료 확인을 합니다.
10. `매핑·발주 → API 상품매칭`에서 상품 1~2건으로 기본수량·배송비·구성원가를 확인합니다.
11. 자동발주를 켜기 전에 `발주 사전검증`을 실행합니다.
