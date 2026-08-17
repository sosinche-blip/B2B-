# B2B 운영 자동화 — V258 CLEAN

쿠팡·토스 주문, AdminPlus 발주/결제/송장, 쿠폰 자동화, 상품매핑을 운영하는 Cloudflare Pages + Worker 기반 프로젝트입니다.

## 현재 구조
- Web: `apps/web` — Cloudflare Pages
- Worker: `apps/worker` — Cloudflare Worker / R2 / Supabase 연동
- Fixed IP: Ncloud — 쿠팡·토스·AdminPlus 외부 API 호출에 필요한 고정 IP 게이트웨이
- DB: Supabase — 매핑/설정/재시도/운영로그
- Shared files: Cloudflare R2 — 발주/송장 파일, 기본 30일 보관
- Regression checks: `scripts/verify_*.mjs`

## V258 정리 내용
- V249 시대의 배포 스크립트/리뷰 문서와 중복 root Ncloud 환경예시 제거
- 사용되지 않는 Web/Worker 함수와 미사용 npm 의존성 제거
- Scheduler는 매분 전체 Supabase 설정 JSON을 다시 받지 않고 `updated_at`만 확인한 뒤 변경 시에만 payload를 재조회
- R2 보관파일 전체 목록 스캔은 매분이 아니라 03:20 KST 1회로 축소
- API JSON pretty-print 제거로 응답 크기/CPU 감소
- Web-only commit에서 Cloudflare Worker가 다시 배포되지 않도록 GitHub Actions paths 필터 적용
- 오늘운영/필터/테이블 입력 높이와 액션바 정렬을 공통 규칙으로 통일

## 배포 전 검증
```bash
npm ci
npm run verify:all
npm run typecheck:worker
npm run build
```

## 보안
- 실제 `.dev.vars`, API Key/Secret, AdminPlus 인증정보는 Git에 올리지 않습니다.
- `apps/worker/.dev.vars.example`에는 예시값만 유지합니다.
- 이 저장소는 Public이므로 운영자 전화번호/주소 같은 개인정보를 소스에 하드코딩하면 공개됩니다. 현재 운영 고정 발주자 정보는 별도 설정화가 필요한 항목으로 남아 있습니다.

## 무료 운영 주의점
Cloudflare Pages/Workers/R2와 Supabase는 무료 한도 안에서 운영 가능하도록 호출량을 줄였지만, Ncloud 고정 IP 서버는 별도 서버 요금이 발생할 수 있습니다. 실제 0원 여부는 Cloudflare Usage, Supabase Usage, Ncloud 청구내역에서 확인해야 합니다.
