# GITHUB UPLOAD GUIDE V176

## 1. PowerShell 기본 명령
```powershell
cd "C:\Users\LG\Documents\GitHub\B2B-"
npm.cmd ci
npm.cmd run verify:all
npm.cmd run verify:git-safe
```

## 2. Git 사용이 가능할 때
```powershell
git status --short
git add apps scripts supabase package.json package-lock.json README.md wrangler.toml .npmrc DEPLOYMENT_GUIDE_V176.md MOBILE_OPERATION_CHECKLIST_V176.md V176_RELEASE_NOTES.md V176_DEVELOPMENT_SUMMARY.md GITHUB_UPLOAD_GUIDE_V176.md
git commit -m "Release V176 GitHub Pages deploy assist"
git push origin main
```

브랜치가 `master`이면 마지막 줄은 `git push origin master`로 사용합니다.

## 3. GitHub 웹 업로드로 진행할 때
1. V176 ZIP 압축 해제
2. GitHub 저장소 접속
3. `Add file` → `Upload files`
4. 아래 금지 항목을 제외하고 업로드
5. `Commit changes`

## 4. 업로드 금지
- `.dev.vars`
- `.env`
- `.env.local`
- `apps/worker/.dev.vars`
- `node_modules`
- `apps/web/dist`
- `.wrangler`

## 5. Pages 환경변수
`VITE_WORKER_URL=https://coupang-toss-b2b-automation.sosinche.workers.dev`

## 6. Pages 배포 후 확인
- `https://b2b-bpt.pages.dev/` 접속
- 버전 `V176_GITHUB_PAGES_DEPLOY_ASSIST` 확인
- `V176 GitHub·Pages 배포 점검` 버튼 실행
