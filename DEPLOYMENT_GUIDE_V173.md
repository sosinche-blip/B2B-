# V173 배포 가이드

## 1. 핵심 원인 확인

`49.167.16.179`가 쿠팡·토스 허용 IP에 이미 등록되어 있는데도 쿠팡 주문수집이 실패한다면, 우선 IP가 아니라 **실행 중인 API 서버에 쿠팡 키가 주입되었는지** 확인해야 합니다.

## 2. Ncloud 서버 확인

```bash
cd /root/b2b-operation
ls -al .dev.vars apps/worker/.dev.vars 2>/dev/null
```

`.dev.vars`에 실제값이 있어야 합니다.

```bash
grep -E 'COUPANG_VENDOR_ID|COUPANG_ACCESS_KEY|COUPANG_SECRET_KEY|TOSS_CLIENT_ID|TOSS_CLIENT_SECRET|API_CONNECTION_PAUSED|ALLOW_LIVE_EXTERNAL_API|ALLOW_FINAL_EXECUTION' .dev.vars
```

화면에 `여기에`, `xxxxx`, `example`이 보이면 실제 키가 아닙니다.

## 3. 서버 재시작

```bash
cd /root/b2b-operation
pkill -f "start_ncloud_api|api-server.mjs|start:ncloud" || true
PORT=8791 HOST=0.0.0.0 nohup npm run start:ncloud > ncloud-api.log 2>&1 &
tail -n 80 ncloud-api.log
```

로그에 다음 문구가 표시됩니다.

```text
[NCLOUD] API server listening on http://0.0.0.0:8791
[NCLOUD] Env source: ...
```

## 4. 모바일 화면 점검

1. `https://b2b-bpt.pages.dev` 접속
2. `운영설정` 이동
3. `환경변수 점검` 실행
4. 다음 항목이 정상인지 확인
   - `쿠팡 설정 종합: 정상`
   - `COUPANG_VENDOR_ID: 정상`
   - `COUPANG_ACCESS_KEY: 정상`
   - `COUPANG_SECRET_KEY: 정상`
   - `토스 설정 종합: 정상`

## 5. 직접 API 점검

```bash
curl -s http://127.0.0.1:8791/api/system/env-diagnostics | head -c 2000
curl -s http://127.0.0.1:8791/api/system/status | head -c 2000
```

## 6. Cloudflare Worker 사용 시

Worker를 직접 API 서버로 쓰는 경우 `.dev.vars`가 아니라 Cloudflare Secret에 실제 키가 들어가야 합니다.

```bash
npx wrangler secret put COUPANG_VENDOR_ID
npx wrangler secret put COUPANG_ACCESS_KEY
npx wrangler secret put COUPANG_SECRET_KEY
npx wrangler secret put TOSS_CLIENT_ID
npx wrangler secret put TOSS_CLIENT_SECRET
npx wrangler deploy --config wrangler.toml
```

## 7. Pages 연결 확인

Pages가 Ncloud API를 바라보는지, Worker를 바라보는지 확인합니다. 운영 중인 API 주소가 바뀌면 Pages 환경변수 `VITE_WORKER_URL` 또는 `VITE_API_BASE_URL`을 실제 API 주소로 맞춘 뒤 다시 빌드해야 합니다.
