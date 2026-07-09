# V178 GitHub 업로드 안내

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
git add apps scripts supabase package.json package-lock.json README.md wrangler.toml .npmrc DEPLOYMENT_GUIDE_V178.md MOBILE_OPERATION_CHECKLIST_V178.md V178_RELEASE_NOTES.md V178_DEVELOPMENT_SUMMARY.md GITHUB_UPLOAD_GUIDE_V178.md
git commit -m "Release V178 mapping upload and API 502 guard"
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

## V178 추가 업로드 주의

V178은 `apps/web`에 `xlsx` 의존성이 추가되었습니다. GitHub 업로드 시 `package.json`과 `package-lock.json`을 반드시 함께 올려야 합니다.

Pages만 배포하면 화면만 바뀝니다. HTTP 502 개선을 반영하려면 Cloudflare Worker도 V178로 재배포해야 합니다.
