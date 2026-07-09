# B2B Coupang/Toss Mobile Operation Automation

Current version: `V178_MAPPING_UPLOAD_STABILITY_AND_NCLOUD_PROXY_GUARD`

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

자세한 업로드 절차는 `GITHUB_UPLOAD_GUIDE_V178.md`를 확인하세요.


## V178 핵심 변경

- 매핑 엑셀 표준을 `채널, 옵션ID, 업체명, 코드번호, 업체상품명, 원가, 기본수량` 7개 열로 정리했습니다.
- xlsx 업로드가 외부 CDN 문제로 실패하는 경우를 줄이기 위해 경량 xlsx 파서를 추가했습니다.
- 쿠팡진단/토스진단/IP확인에서 HTTP 502가 나오면 Worker/Tunnel/Ncloud 경로 문제로 먼저 안내합니다.
- `업체 송장 업로드` 용어는 기존 운영 표현 그대로 유지합니다.
