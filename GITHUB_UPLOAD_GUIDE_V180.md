# V180 GitHub 업로드 안내

## 업로드 전 검증

```powershell
npm.cmd run verify:all
npm.cmd run verify:git-safe
```

## GitHub에 올리면 안 되는 파일

```text
.dev.vars
.env
.env.local
apps/worker/.dev.vars
node_modules
apps/web/dist
.wrangler
.ncloud
```

## Pages 환경변수

Cloudflare Pages 환경변수는 아래 값을 유지합니다.

```text
VITE_WORKER_URL=https://coupang-toss-b2b-automation.sosinche.workers.dev
```

## 서버 실제 환경변수

실제 쿠팡·토스·Supabase 값은 GitHub가 아니라 Ncloud 서버의 `.dev.vars`에만 둡니다.

```bash
cd /root/b2b-operation
npm run check:env
```

보안상 실제 값은 출력하지 않고 길이만 확인합니다.
