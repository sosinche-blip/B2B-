# V249 R10 CLEAN

Coupon scheduled execution is rebuilt around explicit vendorItemId, atomic per-template claims, create→attach→actual APPLIED verification, and verified cleanup before any reissue. Legacy coupon scheduler paths are not called.

# B2B Cloudflare Clean V224

현재 릴리스: AdminPlus 예치금 결제정책 명시 설정 + 발주 전 결제정책 차단(V224).

# B2B Cloudflare 운영본 V222

쿠팡·토스 주문수집, AdminPlus 옵션별 확정매핑/발주, 쿠폰 자동화, 공급가 감시를 위한 **Cloudflare 배포용 정리본**입니다.

## 현재 기준
- Web UI: `V222 쿠팡·토스 결제완료 수동발주 큐 복구 · 서버확정 매핑 우선 · 토스 PAID 수집 보강`
- Worker revision: `manualPurchaseQueueRevision = manual-backlog-server-source-v222-20260809`
- Worker entry: `apps/worker/src/worker.ts`
- Web entry: `apps/web/src/App.tsx`
- GitHub Actions: `.github/workflows/cloudflare-worker-deploy.yml`

## 주요 폴더
- `apps/web` — Cloudflare Pages 웹앱 소스
- `apps/worker` — Cloudflare Worker 소스
- `scripts` — 현재 `verify:all`에서 사용하는 누적 회귀검증
- `supabase` — 운영 DB 스키마/마이그레이션 원본
- `docs` — 현재 V222 배포·검증 문서

## 배포 전 확인
```bash
npm ci
npm run verify:all
```

GitHub `main` 반영 후 `Deploy Cloudflare Worker` workflow가 성공해야 합니다. Pages는 기존 Git 연동 Production 설정을 사용합니다.

## 중요
- `.dev.vars`, `.env`, 실제 API 키/토큰은 GitHub에 업로드하지 않습니다.
- Ncloud Gateway 배포자료는 이 Cloudflare 저장소 정리본에 포함하지 않습니다. Ncloud는 별도 배포 패키지로 관리합니다.
- 과거 V194~V221 배포문서/릴리즈노트/중복 소스는 제거했습니다. 과거 이력은 Git commit history에서 확인합니다.
