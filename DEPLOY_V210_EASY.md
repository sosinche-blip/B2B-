# 웹앱/Worker V210 쉬운 배포

## 이번 버전은 Ncloud 재배포가 필요 없습니다
현재 Ncloud V203 (`v209-adminplus-product-match-price-watch`)을 그대로 사용합니다.

## 배포
1. 현재 GitHub 저장소를 ZIP으로 백업합니다.
2. `B2B_OPERATION_MASTER_V210_EXCEL_ASSISTED_ADMINPLUS_MATCH.zip`을 풉니다.
3. 바깥 폴더가 아니라 안의 파일/폴더 전체를 기존 GitHub 저장소 `main`에 덮어씁니다.
4. GitHub Actions → `Deploy Cloudflare Worker`가 초록색 성공인지 확인합니다.
5. Cloudflare Pages 최신 Production 배포가 Success인지 확인합니다.
6. Worker 상태 URL `/api/health`에서 아래 버전을 확인합니다.

```json
{
  "ok": true,
  "version": "v210-excel-assisted-adminplus-match"
}
```

7. `https://b2b-bpt.pages.dev/`에서 Ctrl+F5 합니다.
8. 설정 → Ncloud 보안 인증관리에서 관리 토큰을 다시 입력합니다.
9. 매핑·발주 → API 상품매칭 → AdminPlus 계정 선택 → `엑셀매핑 자동추천`을 실행합니다.
10. 처음에는 확정가능 후보 1~2건만 확인 후 확정하고 발주 사전검증을 실행합니다.
