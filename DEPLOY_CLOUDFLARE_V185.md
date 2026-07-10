# V185 Cloudflare 배포

## 1. 사전 조건

- Cloudflare Pages 웹 배포
- Cloudflare Worker API 게이트웨이
- Supabase Secret: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Ncloud 고정 IP API: `http://101.79.27.234.sslip.io:8080`
- 기존 R2 바인딩은 다른 발주파일 기능을 위해 유지할 수 있습니다.

업체 송장 임시선택과 최종 업로드 흐름은 R2 저장 API를 호출하지 않습니다.

## 2. 검증

```bash
npm ci
npm run verify:all
```

## 3. 배포

GitHub `main` 브랜치에 반영하거나 Worker를 직접 배포합니다.

```bash
npx wrangler deploy
```

웹은 기존 Cloudflare Pages 배포 절차를 사용합니다.

## 4. 배포 후 확인

1. 업체송장 선택 직후 Network 탭에 `/api/local/save-many` 요청이 없어야 합니다.
2. 첫 번째 `쿠팡+토스 업로드`는 상품준비중 조회와 매칭만 수행해야 합니다.
3. 화면에 `최종 업로드` 버튼과 채널별 준비 건수가 표시되어야 합니다.
4. 최종 업로드 후 `/api/integrations/shipments/upload-execute`가 한 번 호출되어야 합니다.
5. 결과 엑셀 4개와 ZIP을 다운로드할 수 있어야 합니다.

Ncloud에는 V185 전체 압축파일을 배포하지 않습니다.
