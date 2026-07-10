# V180 고정 IP 최종 운영 안내

## 1. 고정 운영 경로

- 모바일/웹: Cloudflare Pages
- API 게이트웨이: `https://coupang-toss-b2b-automation.sosinche.workers.dev`
- Ncloud 원본 API: `http://101.79.27.234.sslip.io:8080`
- 외부 API 출구 공인 IP: `101.79.27.234`

Worker는 `/api/*` 요청만 Ncloud 원본 API로 전달합니다. 임시 `trycloudflare.com` 주소와 IP 리터럴 직접 호출은 사용하지 않습니다.

## 2. 최초 또는 변경 후 배포

```bash
npm ci
npm run verify:all
npx wrangler deploy
```

Cloudflare Pages 환경변수는 다음 값만 사용합니다.

```text
VITE_WORKER_URL=https://coupang-toss-b2b-automation.sosinche.workers.dev
```

`VITE_NCLOUD_TUNNEL_URL`은 비워 둡니다.

## 3. Ncloud 서버 실행

```bash
PORT=8080 HOST=0.0.0.0 nohup npm run start:ncloud > ncloud-api.log 2>&1 &
```

확인 주소:

```text
http://127.0.0.1:8080/api/system/status
http://127.0.0.1:8080/api/system/public-ip
```

## 4. 최종 정상 기준

1. Worker 루트 응답의 `ncloudApiBase`가 `http://101.79.27.234.sslip.io:8080`이다.
2. `/api/system/public-ip` 응답이 `ok: true`이고 `outboundIp`가 `101.79.27.234`이다.
3. `npm run verify:all`이 모두 통과한다.
4. Ncloud ACG에서 실제 운영 포트 `8080`이 허용되어 있다.

## 5. 수정이 필요한 경우

고정 공인 IP, Worker 도메인, Ncloud 운영 포트 중 하나가 변경될 때만 설정 또는 코드를 수정합니다. 그 외에는 주소를 반복 변경하지 않습니다.
