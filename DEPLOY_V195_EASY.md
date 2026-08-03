# V195 쉬운 배포 순서

## A. 먼저 Ncloud 게이트웨이 배포

별도 제공되는 `NCLOUD_FIXED_IP_GATEWAY_V194_RUNTIME_API_PATHS_COUPON_IMMEDIATE.zip`을 사용합니다.

현재 서버 예시:

```text
공인 IP: 101.79.27.234
서비스: b2b-ncloud-api
기존 실행 폴더: /root/ncloud-coupang-fixed/NCLOUD_FIXED_IP_GATEWAY_V193_20260711
```

새 ZIP의 안내서 `DEPLOY_NCLOUD_V194_EASY.md` 순서로 배포하고 다음 결과를 확인합니다.

```bash
systemctl status b2b-ncloud-api --no-pager
curl -sS http://127.0.0.1:8080/api/system/status
```

`active (running)`과 `v195-api-path-coupon-immediate`가 나오면 정상입니다.

## B. Cloudflare 전체본 배포

기존 GitHub 저장소의 코드를 이 ZIP 내용으로 교체한 뒤 Worker와 Pages를 배포합니다.

```bash
npm ci
npm run verify:all
npm --workspace apps/worker run deploy
npm --workspace apps/web run build
```

Pages가 GitHub 자동 배포라면 소스를 push한 뒤 배포 완료를 확인합니다.

## C. 웹앱 설정

1. 웹앱 `https://b2b-bpt.pages.dev/` 접속
2. `Ctrl + F5`
3. 운영설정 → API 경로 관리
4. 기본 경로가 맞는지 확인
5. `Ncloud 자동운영용 서버 저장`
6. `쿠팡 주문 API 진단`

## D. 쿠폰 기능 확인

1. 쿠폰관리 → 24시간 반복 대상 목록
2. 할인방식에서 `정액(원)` 또는 `정률(%)` 선택
3. 정률이면 최대 할인금액 입력
4. `다음 발행부터`: 현재 쿠폰 유지, 다음 발행부터 변경
5. `즉시 적용`: 현재 쿠폰 취소 후 변경 조건으로 신규 쿠폰 생성·적용

실제 운영 쿠폰을 바꾸는 `즉시 적용`은 couponId와 대상 옵션을 확인한 뒤 실행합니다.
