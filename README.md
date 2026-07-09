# B2B Coupang/Toss Mobile Operation Automation

Current version: `V176_GITHUB_PAGES_DEPLOY_ASSIST`

## 목적
쿠팡·토스 주문 수집, 옵션ID 기준 B2B 매핑, 업체별 발주 엑셀 ZIP 다운로드, 업체 송장 업로드, 송장 매칭, 쿠팡·토스 송장 API 업로드, 쿠폰 자동화, 서버 정리를 모바일 중심으로 운영합니다.

## 운영 주소
- Pages: `https://b2b-bpt.pages.dev`
- Worker: `https://coupang-toss-b2b-automation.sosinche.workers.dev`
- Ncloud outbound IP: `101.79.27.234`

`VITE_WORKER_URL`은 반드시 Worker 주소로 유지합니다.

## 검증
```bash
npm run verify:all
```

## GitHub 업로드 전 확인
```bash
npm run verify:git-safe
```

자세한 업로드 절차는 `GITHUB_UPLOAD_GUIDE_V176.md`를 확인하세요.
