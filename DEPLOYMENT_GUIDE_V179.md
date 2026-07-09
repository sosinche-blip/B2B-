# V179_CODEBASE_CLEANUP_AND_BAD_PATCH_REMOVAL 배포 안내

## 1. 목적
V179는 기능 추가 버전이 아니라, V177~V178 과정에서 늘어난 불필요 문서와 잘못된 우회성 코드를 정리한 배포 안정화 버전입니다.

## 2. 유지한 운영 기준
- 모바일 접속 주소: https://b2b-bpt.pages.dev
- Pages 환경변수: VITE_WORKER_URL=https://coupang-toss-b2b-automation.sosinche.workers.dev
- Worker 주소: https://coupang-toss-b2b-automation.sosinche.workers.dev
- Ncloud API 서버 내부 기준: http://127.0.0.1:8080
- 실제 쿠팡·토스 허용 IP 기준: 101.79.27.234

## 3. 삭제·정리 기준
- 과거 V169~V178 문서 중복본은 배포 ZIP 루트에서 제거했습니다.
- `NCLOUD_DIRECT_API_BASE`, `NCLOUD_DIRECT_FALLBACK_ENABLED` 직접 우회 코드는 제거했습니다.
- `API 502 점검` 별도 패널은 제거하고, 기본 실행경로 점검과 환경변수 점검으로 단순화했습니다.
- PC 로컬 실행 CMD 파일은 기본 배포 루트에서 제거했습니다.

## 4. 배포 전 검증
```powershell
npm.cmd ci
npm.cmd run verify:all
npm.cmd run verify:git-safe
```

## 5. 배포 주의
GitHub에는 `.dev.vars`, `.env`, `.env.local`, `apps/worker/.dev.vars`, `node_modules`, `apps/web/dist`, `.wrangler`를 올리지 않습니다.

