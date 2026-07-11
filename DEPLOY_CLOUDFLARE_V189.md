# V189 Cloudflare 배포

## 1. 배포 대상

- GitHub 저장소: V189 전체 소스
- Cloudflare Worker·Pages: GitHub 배포
- Supabase: 기존 V187 쿠폰 자동화 마이그레이션 유지
- Ncloud: 기존 V187 최소 고정 IP 게이트웨이 유지

## 2. 배포 순서

1. V189 소스를 기존 Git 저장소에 덮어씁니다.
2. `npm ci`를 실행합니다.
3. `npm run verify:all`을 실행합니다.
4. 검증 통과 후 GitHub에 커밋·푸시합니다.
5. GitHub Actions의 `Deploy Worker`가 초록색인지 확인합니다.
6. Cloudflare Pages 최신 배포를 확인합니다.
7. 앱에서 `Ctrl + Shift + R`로 강력 새로고침합니다.

## 3. Ncloud

V189는 기존 Ncloud V187의 다음 API를 재사용합니다.

- `/api/integrations/coupang/products/prices-sync`
- `/api/integrations/coupons/action-preview`
- 쿠폰 계약·목록·요청상태 관련 기존 경로

따라서 Ncloud 재배포는 필요하지 않습니다.
