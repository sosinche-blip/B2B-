# V169 서버 배포 가이드

## 권장 구조

- GitHub: 소스 저장소, 버전관리, 필요 시 GitHub Actions 배포
- Supabase: 운영설정, 매핑, 스케줄러 이력, 저장소 점검 로그 보관
- Cloudflare Workers: API, 쿠폰 스케줄러, 쿠팡/토스 호출 프록시
- Cloudflare Pages 또는 Ncloud Server: 모바일 접속용 웹 화면
- Ncloud Server: 쿠팡 Open API 허용 IP가 반드시 고정되어야 할 때 권장

## 1. Supabase 설정

1. Supabase 프로젝트 생성
2. SQL Editor에서 `supabase/schema.sql` 실행
3. Project Settings > API에서 `Project URL`과 `service_role key` 확인
4. 이 값은 Worker Secret으로만 등록하고 GitHub에 올리지 않음

명령형으로 운영할 경우 Supabase CLI의 migration 기능을 사용할 수 있습니다. 로컬 migration은 `supabase/migrations`에 보관되고, 원격 적용 상태는 Supabase의 migration 테이블로 추적됩니다.

## 2. GitHub 업로드

```bash
git init
git add .
git commit -m "B2B operation V169"
git branch -M main
git remote add origin https://github.com/<계정>/<저장소>.git
git push -u origin main
```

`.dev.vars`, `.env`, 실제 Access Key/Secret Key는 절대 커밋하지 않습니다.

## 3. Cloudflare Workers 배포

```bash
npm ci
npx wrangler login
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put COUPANG_VENDOR_ID
npx wrangler secret put COUPANG_ACCESS_KEY
npx wrangler secret put COUPANG_SECRET_KEY
npx wrangler secret put TOSS_CLIENT_ID
npx wrangler secret put TOSS_CLIENT_SECRET
npm --workspace apps/worker run deploy
```

배포 후 확인:

```bash
npx wrangler tail
```

`wrangler.toml`에는 비밀값이 아닌 경로·Gate·스케줄 값만 둡니다.

## 4. Cloudflare Pages 웹 배포

Cloudflare Pages에서 GitHub 저장소를 연결합니다.

- Framework preset: None 또는 Vite
- Build command: `npm ci && npm --workspace apps/web run build`
- Build output directory: `apps/web/dist`
- Environment variable: `VITE_WORKER_URL=https://<worker-url>` 형식으로 Worker 주소를 설정

현재 앱은 로컬 PC 발주폴더 기능도 포함합니다. 완전 모바일 운영으로 전환하려면 발주파일/송장파일 보관을 Supabase Storage 또는 Ncloud Object Storage로 옮기는 2단계 개편이 필요합니다.

## 5. Ncloud 사용 판단

쿠팡 Open API가 IP 허용을 요구하므로, Cloudflare Workers의 일반 egress IP만으로 403이 반복되면 Ncloud Server에 고정 Public IP를 붙이고 그 IP를 쿠팡 판매자센터/Open API 허용 IP에 등록하는 방식이 안전합니다.

Ncloud Server 방식:

1. Ncloud Server 생성
2. Public IP 신청 및 서버 할당
3. 방화벽/ACG에서 80, 443, 필요 시 5173/8787/8791 제한 허용
4. Node.js LTS 설치
5. GitHub 저장소 clone
6. `.dev.vars` 생성 후 실제 키 입력
7. `npm ci && npm run verify:all`
8. PM2 또는 Windows 작업 스케줄러로 실행 유지
9. 쿠팡 Open API 허용 IP에 Ncloud Public IP 등록

Ncloud Cloud Functions는 간단한 서버리스 액션에는 적합하지만, 이 앱처럼 발주폴더 파일 처리와 장시간 운영 UI가 필요한 구조에는 Ncloud Server 또는 Cloudflare Worker + 별도 저장소 구성이 더 적합합니다.

## 6. 배포 전 최종 검증

```bash
npm run check:env
npm run verify:all
```

모바일에서 확인할 주소:

- Cloudflare Pages URL 또는 Ncloud 도메인
- `/api/system/status` Worker 상태
- 쿠폰 스케줄러는 운영설정/스케줄러 메뉴의 최근 로그로 확인
