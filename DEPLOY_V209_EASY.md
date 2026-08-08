# 웹앱 V209 쉬운 배포

## 배포 순서
**Ncloud V203을 먼저 배포하고 정상 확인한 뒤 웹앱 V209를 배포합니다.**

1. 현재 GitHub 저장소를 ZIP으로 백업합니다.
2. `B2B_OPERATION_MASTER_V209_ADMINPLUS_PRODUCT_MATCH_PRICE_ALERT.zip`을 풉니다.
3. 바깥 폴더가 아니라 안의 파일/폴더 전체를 기존 GitHub 저장소 `main`에 덮어씁니다.
4. GitHub Actions `Deploy Cloudflare Worker`가 초록색 성공인지 확인합니다.
5. Cloudflare Pages 최신 Production 배포가 Success인지 확인합니다.
6. Worker 상태 URL `/api/health`의 version이 `v209-adminplus-product-match-price-watch`인지 확인합니다.
7. `https://b2b-bpt.pages.dev/`에서 `Ctrl+F5` 합니다.
8. `설정 → Ncloud 보안 인증관리`에 관리 토큰을 입력합니다.
9. `설정 → 어드민플러스 셀러 API 다계정 관리`에서 `전체 연결·만료 확인`을 실행합니다.
10. `매핑·발주 → API 상품매칭`에서 계정 1개, 상품 1~2개를 먼저 매칭합니다.
11. `지금 가격확인`과 `발주 사전검증`을 통과한 뒤 자동화를 켭니다.

## Worker 정상 기준
```json
{
  "ok": true,
  "version": "v209-adminplus-product-match-price-watch"
}
```
