# DEPLOYMENT GUIDE V176 - GitHub Pages Deploy Assist

## 1. 목적
V176은 첨부 V169 원본을 기준으로 재정리한 V175에서 이어서, GitHub 업로드 후 `https://b2b-bpt.pages.dev/`에서 화면과 실행경로를 바로 확인하기 위한 배포 점검 버전입니다.

## 2. 유지해야 할 운영 주소
- Pages: `https://b2b-bpt.pages.dev`
- Worker: `https://coupang-toss-b2b-automation.sosinche.workers.dev`
- Pages 환경변수: `VITE_WORKER_URL=https://coupang-toss-b2b-automation.sosinche.workers.dev`
- Ncloud outbound IP: `101.79.27.234`

`VITE_WORKER_URL`을 `http://101.79.27.234:8080`으로 바꾸지 않습니다. HTTPS Pages에서 HTTP API 직접 호출은 브라우저 보안정책에 의해 차단될 수 있습니다.

## 3. 배포 전 로컬 검증
```powershell
npm.cmd ci
npm.cmd run verify:all
npm.cmd run verify:git-safe
```

## 4. GitHub 업로드 제외 파일
- `.dev.vars`
- `.env`
- `.env.local`
- `apps/worker/.dev.vars`
- `node_modules`
- `apps/web/dist`
- `.wrangler`

## 5. 배포 후 확인 순서
1. Cloudflare Pages 배포 성공 확인
2. `https://b2b-bpt.pages.dev/` 접속
3. 첫 화면 버전 `V176_GITHUB_PAGES_DEPLOY_ASSIST` 확인
4. `V176 GitHub·Pages 배포 점검` 실행
5. `실행경로 점검`, `환경변수 점검`, `IP 확인` 순서로 확인

## 6. 실운영 전 주의
현재 Worker가 임시 `trycloudflare.com` Quick Tunnel을 바라보면 서버 재시작 시 주소가 바뀔 수 있습니다. 실운영 전 고정 Cloudflare Tunnel 또는 도메인 기반 HTTPS API로 전환해야 합니다.
