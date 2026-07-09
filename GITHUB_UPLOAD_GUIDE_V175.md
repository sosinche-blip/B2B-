# GitHub 업로드 가이드 V175

## 1. 전제

이 프로젝트는 GitHub에 업로드되면 Cloudflare Pages가 `https://b2b-bpt.pages.dev` 화면을 자동 배포하는 구조입니다.

Cloudflare Pages 환경변수는 아래 값을 유지합니다.

```text
VITE_WORKER_URL=https://coupang-toss-b2b-automation.sosinche.workers.dev
```

아래처럼 바꾸면 안 됩니다.

```text
VITE_WORKER_URL=http://101.79.27.234:8080
```

## 2. Windows PowerShell 명령어

PowerShell 보안정책 때문에 `npm`이 막히면 `npm.cmd`를 사용합니다.

```powershell
cd "C:\Users\LG\Documents\GitHub\B2B-"
npm.cmd ci
npm.cmd run verify:all
npm.cmd run verify:git-safe
git status --short
git branch --show-current
```

## 3. 민감파일 확인

아래 파일은 GitHub에 올리면 안 됩니다.

```text
.dev.vars
.env
.env.local
apps/worker/.dev.vars
```

## 4. 업로드 명령어

브랜치가 `main`이면 아래처럼 진행합니다.

```powershell
git add apps scripts supabase package.json package-lock.json README.md wrangler.toml wrangler.toml.example .npmrc .gitignore DEPLOYMENT_GUIDE_V175.md MOBILE_OPERATION_CHECKLIST_V175.md V175_RELEASE_NOTES.md V175_DEVELOPMENT_SUMMARY.md GITHUB_UPLOAD_GUIDE_V175.md GITHUB_UPLOAD_V175_WINDOWS.cmd

git commit -m "Release V175 attachment rebase deploy ready"

git push origin main
```

브랜치가 `master`이면 마지막 줄만 아래처럼 바꿉니다.

```powershell
git push origin master
```
