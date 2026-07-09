# V179 GitHub 업로드 안내

## 1. 압축 해제 후 저장소에 복사
V179 ZIP을 압축 해제한 뒤 GitHub 저장소 폴더에 복사합니다.

## 2. 업로드 제외
다음 파일과 폴더는 GitHub에 올리지 않습니다.

- `.dev.vars`
- `.env`
- `.env.local`
- `apps/worker/.dev.vars`
- `node_modules`
- `apps/web/dist`
- `.wrangler`

## 3. 검증
```powershell
npm.cmd ci
npm.cmd run verify:all
npm.cmd run verify:git-safe
```

## 4. Pages 환경변수 유지
```text
VITE_WORKER_URL=https://coupang-toss-b2b-automation.sosinche.workers.dev
```

## 5. Worker 환경 기준
Worker에는 `NCLOUD_API_BASE`만 사용합니다.
`NCLOUD_DIRECT_API_BASE` 직접 fallback은 V179에서 제거했습니다.
