# V183 Cloudflare 배포

## 1. 최초 1회: R2 버킷 생성

Cloudflare 대시보드에서 R2 Object Storage를 열고 다음 버킷을 생성합니다.

- `b2b-operation-files`

또는 Wrangler 로그인 상태에서:

```bash
npx wrangler r2 bucket create b2b-operation-files
```

## 2. Worker에 필요한 Cloudflare Secret

Supabase 저장 기능을 Worker가 직접 사용하므로 다음 Secret이 필요합니다.

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Ncloud 고정 IP 주소를 바꿀 때만 다음 값을 등록합니다.

```bash
npx wrangler secret put NCLOUD_API_BASE
```

현재 기본값은 `http://101.79.27.234.sslip.io:8080`입니다.

쿠팡·토스 인증키는 현재 Ncloud `.dev.vars`에 유지합니다. GitHub나 ZIP에 넣지 않습니다.

## 3. GitHub 배포

V183 파일을 기존 GitHub 저장소 main 브랜치에 반영하면 GitHub Actions가 다음을 실행합니다.

1. npm ci
2. 전체 검증
3. Cloudflare Worker 배포

Cloudflare Pages가 같은 저장소에 연결돼 있으면 웹 화면도 자동 빌드됩니다.

## 4. 배포 후 확인

```text
https://coupang-toss-b2b-automation.sosinche.workers.dev/api/local/health
```

정상 응답:

```json
{"ok":true,"mode":"cloudflare_r2_purchase_folder_v183"}
```

앱에서 업체송장 버튼으로 여러 파일을 선택한 뒤 최근 파일목록에 표시되는지 확인합니다.

## 5. Ncloud

V183 전체 압축파일을 Ncloud에 올리지 않습니다. 현재 실행 중인 V181 Ncloud 서비스와 인증정보를 유지합니다. Ncloud는 쿠팡·토스 고정 IP API 호출과 쿠폰 스케줄 실행만 담당합니다.
