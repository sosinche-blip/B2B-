# V187 Cloudflare 배포

## 1. 사전 검증

```bash
npm ci
npm run verify:all
```

## 2. Supabase

`supabase/migrations/20260710_v187_coupon_automation.sql`을 실행합니다.

## 3. Worker 배포

```bash
npx wrangler deploy --config wrangler.toml
```

GitHub Actions를 사용하는 경우 `main` 브랜치 반영 후 Actions 성공 여부를 확인합니다.

## 4. Pages 배포

Cloudflare Pages의 빌드 설정은 기존과 같습니다.

```text
Build command: npm ci && npm --workspace apps/web run build
Output directory: apps/web/dist
```

## 5. 배포 후 확인

```text
GET /api/system/status
GET /api/system/server-operation-check
```

쿠폰관리에서 다음 순서로 시험합니다.

```text
계약 조회 → 쿠폰 조회 → 1개 쿠폰 선택 → 사전검증 → 자동운영 활성화
```

실제 자동교체 전에는 쿠폰 1개로 먼저 검증하고 운영로그와 실패 알림을 확인합니다.
