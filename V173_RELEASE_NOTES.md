# V173_MOBILE_ENV_BINDING_GUARD 릴리스 노트

## 1. 수정 배경

쿠팡·토스 허용 IP에 `49.167.16.179`가 등록되어 있음에도 진단표에서 `HTTP 0: 쿠팡 API 키가 설정되지 않았습니다.`가 반복되는 문제를 기준으로 수정했습니다.

## 2. 핵심 판단

1. 현재 표시된 오류는 IP 허용 오류가 아니라 **쿠팡 인증키가 API 서버 런타임에 주입되지 않은 오류**입니다.
2. IP 등록이 되어 있어도 `COUPANG_VENDOR_ID`, `COUPANG_ACCESS_KEY`, `COUPANG_SECRET_KEY`가 실제 실행 중인 Worker/Ncloud Node 서버에 없으면 쿠팡 주문수집은 실패합니다.
3. 기존 화면은 IP 확인 결과를 항상 `등록필요`처럼 보여줘 원인 판단을 흐리게 만들 수 있었습니다.

## 3. 변경사항

1. `/api/system/env-diagnostics` 추가
   - 쿠팡, 토스, Supabase 키 주입 상태를 마스킹하여 표시합니다.
   - 실제 키 값은 노출하지 않습니다.

2. 쿠팡 주문수집 오류 구조 개선
   - 기존: `HTTP 0: Error: 쿠팡 API 키가 설정되지 않았습니다.`
   - 변경: `COUPANG_CREDENTIALS_MISSING`, `CONFIG_MISSING`, 환경변수별 누락 여부 표시

3. IP 점검 문구 개선
   - IP가 이미 등록되어 있으면 IP 항목은 통과로 판단하도록 문구를 변경했습니다.
   - IP 등록 후에도 실패하면 환경변수 점검을 우선하도록 안내합니다.

4. Ncloud Node 서버 환경파일 로딩 강화
   - 실행 위치가 달라도 `.dev.vars`, `apps/worker/.dev.vars`, `/etc/b2b-operation.env`, `/root/b2b-operation/.dev.vars`, `/root/.b2b-operation.env`를 자동 탐색합니다.
   - 로딩된 환경파일 출처를 `/api/system/env-diagnostics`에서 확인할 수 있습니다.

5. 모바일 운영설정 화면 보강
   - `환경변수 점검` 버튼을 추가했습니다.
   - 쿠팡·토스 키 주입 상태를 운영점검표에 표시합니다.

## 4. 운영 조치

1. Ncloud에서 실제 앱 폴더의 `.dev.vars`에 아래 값이 실제값인지 확인합니다.
   - `COUPANG_VENDOR_ID`
   - `COUPANG_ACCESS_KEY`
   - `COUPANG_SECRET_KEY`
   - `TOSS_CLIENT_ID`
   - `TOSS_CLIENT_SECRET`

2. 서버를 재시작합니다.

```bash
cd /root/b2b-operation
npm run start:ncloud
```

3. 모바일 Pages에서 `운영설정 → 환경변수 점검`을 실행합니다.

## 5. 검증 결과

`npm run verify:all` 기준으로 Web production build, Worker TypeScript check, 서비스 검증을 통과하도록 구성했습니다.
