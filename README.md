# B2B Operation V195

V195는 V194 운영관제본과 쿠팡 401 서명 수정본을 기반으로 다음 기능을 추가한 Cloudflare 전체본입니다.

1. 운영설정 화면에서 쿠팡·토스 API 경로/버전을 변경하고 서버에 저장
2. 저장한 API 경로를 수동 API 호출과 Ncloud 자동 스케줄러에 함께 적용
3. 쿠폰관리 24시간 반복대상의 할인조건을 즉시 교체하는 `즉시 적용` 버튼
4. 반복 쿠폰의 정액 할인과 정률 할인(최대 할인금액 포함) 지원

## 중요 배포 순서

1. `NCLOUD_FIXED_IP_GATEWAY_V194_RUNTIME_API_PATHS_COUPON_IMMEDIATE.zip`을 Ncloud에 먼저 배포
2. 이 전체본을 GitHub/Cloudflare Worker 및 Pages에 배포
3. 웹앱의 운영설정 → API 경로 관리에서 `Ncloud 자동운영용 서버 저장`
4. 쿠팡 주문 API 진단 실행

기존 API Key, Secret Key, Vendor ID는 화면에 표시하거나 ZIP에 포함하지 않습니다. 기존 Ncloud `.dev.vars`를 그대로 복사해 사용합니다.

## 검증

```bash
npm ci
npm run verify:all
```

패키지 설치가 가능한 환경에서 Web production build와 Worker typecheck까지 수행합니다. 의존성 설치 전에도 다음 정적 검증을 실행할 수 있습니다.

```bash
node scripts/verify_operation_control.mjs
node scripts/verify_v195_api_coupon.mjs
node scripts/verify_address_integrity.mjs
```

자세한 변경 및 배포 방법은 `V195_RELEASE_NOTES.md`, `DEPLOY_V195_EASY.md`를 확인하세요.
