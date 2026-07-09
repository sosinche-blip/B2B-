# V177 GitHub 업로드 안내

## PowerShell 명령어

```powershell
cd "C:\Users\LG\Documents\GitHub\B2B-"
npm.cmd ci
npm.cmd run verify:all
npm.cmd run verify:git-safe
```

검증 후 Git이 설치되어 있으면 다음을 실행합니다.

```powershell
git status --short
git add apps scripts supabase package.json package-lock.json README.md wrangler.toml .npmrc DEPLOYMENT_GUIDE_V177.md MOBILE_OPERATION_CHECKLIST_V177.md V177_RELEASE_NOTES.md V177_DEVELOPMENT_SUMMARY.md GITHUB_UPLOAD_GUIDE_V177.md
git commit -m "Release V177 mapping upload and API 502 guard"
git push origin main
```

## 업로드 금지

- `.dev.vars`
- `.env`
- `.env.local`
- `apps/worker/.dev.vars`
- `node_modules`
- `apps/web/dist`
- `.wrangler`

## Cloudflare Pages 환경변수

```text
VITE_WORKER_URL=https://coupang-toss-b2b-automation.sosinche.workers.dev
```
