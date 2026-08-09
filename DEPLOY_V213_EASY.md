# 웹앱/Worker V213 쉬운 배포

## 배포 순서
1. **Ncloud V206을 먼저 배포**하고 `/api/system/status`가 `v213-per-option-payment-toss-mapping`인지 확인합니다.
2. 현재 GitHub 저장소를 ZIP으로 백업합니다.
3. `B2B_OPERATION_MASTER_V213_PER_OPTION_TIME_PAYMENT_TOSS_FIX.zip`을 풉니다.
4. 바깥 폴더가 아니라 **안의 파일/폴더 전체**를 기존 GitHub 저장소 `main`에 덮어씁니다.
5. GitHub Actions `Deploy Cloudflare Worker`가 초록색 성공인지 확인합니다.
6. Cloudflare Pages 최신 Production 배포가 Success인지 확인합니다.
7. Worker `/api/health` 버전이 `v213-per-option-payment-toss-mapping`인지 확인합니다.
8. `https://b2b-bpt.pages.dev/`에서 `Ctrl+F5` 합니다.
9. `설정 → Ncloud 보안 인증관리`에 관리 토큰을 한 번 입력합니다. 같은 브라우저 탭에서 새로고침해도 유지되지만 탭/세션을 종료하면 다시 입력합니다.
10. `설정 → 어드민플러스 셀러 API 다계정 관리`에서 `전체 연결·만료 확인`을 실행합니다.
11. `매핑·발주 → API 상품매칭`에서 옵션별 발주시간과 매칭을 확인합니다.
12. `자동화`에서 업체별 예치금 자동결제를 켜려면 **1회 한도와 일일 한도**를 먼저 설정하고 소액 1건으로 테스트합니다.
13. 일일 운영 점검판에서 `결제완료 → 수집완료 → 상품준비중` 전환을 확인한 뒤 전체 자동화를 운영합니다.

## Worker 정상 기준
```json
{
  "ok": true,
  "version": "v213-per-option-payment-toss-mapping"
}
```
