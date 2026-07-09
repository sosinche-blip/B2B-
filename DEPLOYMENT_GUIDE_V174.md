# DEPLOYMENT GUIDE V174_MOBILE_RUNTIME_PATH_CLARITY

## 1. 목적
V174는 새 기능 확장보다 모바일 실운영 시 헷갈리는 실행경로, IP, 환경변수, 임시 Tunnel 위험을 화면에서 분리해 확인하도록 보강한 버전입니다.

## 2. 유지해야 할 배포 구조

1. 모바일 화면
   - `https://b2b-bpt.pages.dev`
   - Cloudflare Pages는 화면만 담당합니다.

2. Pages 환경변수
   - `VITE_WORKER_URL=https://coupang-toss-b2b-automation.sosinche.workers.dev`
   - `VITE_WORKER_URL`을 `http://101.79.27.234:8080`으로 직접 바꾸면 안 됩니다.
   - HTTPS Pages에서 HTTP API를 직접 호출하면 브라우저 보안정책으로 차단될 수 있습니다.

3. Worker / HTTPS 중계
   - `https://coupang-toss-b2b-automation.sosinche.workers.dev`
   - Worker는 모바일 Pages와 Ncloud API 서버 사이의 HTTPS 진입점으로 유지합니다.

4. Ncloud API 서버
   - 서버 공인 IP: `101.79.27.234`
   - 서버 내부 API: `http://127.0.0.1:8080`
   - 외부 점검 API: `http://101.79.27.234:8080/api/system/status`
   - 실제 쿠팡·토스 허용 IP 기준: `101.79.27.234`

## 3. V174 신규 점검 API

1. 실행경로 점검
   - `GET /api/system/runtime-path`
   - 확인 항목: Pages 기준, Worker 기준, Ncloud 내부 API, outbound IP 기준, Tunnel 상태, 쿠팡·토스 키 주입 상태

2. 기존 점검 API 유지
   - `GET /api/system/public-ip`
   - `GET /api/system/env-diagnostics`
   - `GET /api/system/status`

## 4. 임시 Tunnel 주의
현재 인수인계 기준 임시 Tunnel 값은 다음과 같습니다.

```text
https://cookies-bachelor-border-damages.trycloudflare.com
```

이 값은 Quick Tunnel 주소라서 서버 재부팅, cloudflared 종료, 터널 재시작 시 바뀔 수 있습니다. 실운영 전에는 고정 Cloudflare Tunnel 또는 도메인 기반 HTTPS API 주소로 전환해야 합니다.

## 5. 서버 실행

```bash
cd /root/b2b-operation
pkill -f "start_ncloud_api|api-server.mjs|start:ncloud" || true
PORT=8080 HOST=127.0.0.1 nohup npm run start:ncloud > ncloud-api.log 2>&1 &
tail -n 80 ncloud-api.log
```

## 6. 배포 전 확인

1. Pages 환경변수 `VITE_WORKER_URL` 확인
2. Worker 또는 Ncloud 런타임 환경변수 확인
3. `/api/system/runtime-path` 실행
4. `/api/system/public-ip`에서 outbound IP `101.79.27.234` 확인
5. `/api/system/env-diagnostics`에서 쿠팡·토스 키 주입 확인
6. 모바일 간편운영에서 V174 실행경로 점검 확인
