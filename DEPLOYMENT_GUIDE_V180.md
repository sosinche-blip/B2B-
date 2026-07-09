# V180 배포 안내

## 핵심 구조

운영 구조는 다음으로 유지합니다.

```text
모바일 Pages
→ Cloudflare Worker
→ Cloudflare Tunnel 또는 고정 HTTPS API 주소
→ Ncloud API 서버 8080
→ 쿠팡·토스 API
```

Pages 환경변수는 아래 값을 유지합니다.

```text
VITE_WORKER_URL=https://coupang-toss-b2b-automation.sosinche.workers.dev
```

`VITE_WORKER_URL`을 `http://101.79.27.234:8080`으로 직접 바꾸지 않습니다.

## GitHub 업로드 전 점검

```bash
npm run verify:all
npm run verify:git-safe
```

## Ncloud 서버 환경변수 점검

Ncloud 서버에서 실제 `.dev.vars`가 들어 있는 폴더로 이동합니다.

```bash
cd /root/b2b-operation
npm run check:env
```

정상 기준은 다음 필수값이 `OK / SET(length=숫자)`로 보이는 것입니다.

- `COUPANG_VENDOR_ID`
- `COUPANG_ACCESS_KEY`
- `COUPANG_SECRET_KEY`
- `TOSS_CLIENT_ID`
- `TOSS_CLIENT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Ncloud API 서버 실행

V180 기준 기본 포트는 8080입니다.

```bash
cd /root/b2b-operation
PORT=8080 HOST=0.0.0.0 nohup npm run start:ncloud > ncloud-api.log 2>&1 &
tail -n 80 ncloud-api.log
```

서버 내부 확인:

```bash
curl -s http://127.0.0.1:8080/api/system/status
curl -s http://127.0.0.1:8080/api/system/env-diagnostics
curl -s http://127.0.0.1:8080/api/system/public-ip
```

## Cloudflare Worker 확인

Worker는 `NCLOUD_API_BASE`로 Ncloud API 서버의 HTTPS Tunnel 또는 고정 HTTPS 주소를 바라봐야 합니다.

```text
NCLOUD_API_BASE=https://현재-사용중인-터널-또는-고정도메인
```

임시 `trycloudflare.com` 주소를 쓰는 경우, 터널이 재시작되면 주소가 바뀔 수 있습니다.

## 배포 후 화면 확인

```text
https://b2b-bpt.pages.dev/
```

확인 순서:

1. 화면 버전이 V180인지 확인
2. 환경변수 점검 실행
3. IP 확인 실행
4. 쿠팡 진단 실행
5. 토스 진단 실행
6. 매핑 양식 업로드
7. 업체별 발주 ZIP 다운로드
