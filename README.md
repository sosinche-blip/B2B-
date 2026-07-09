# B2B 쿠팡·토스 모바일 운영 자동화 앱

Current version: `V181_PAGES_NPM_REGISTRY_LOCK_FIX`

V181은 Cloudflare Pages 빌드가 내부 npm registry URL로 인해 실패하던 문제를 수정한 배포 안정화 버전입니다. `package-lock.json`은 public npm registry 기준이어야 합니다.

## 운영 목적
쿠팡·토스 주문을 API로 수집하고, 옵션ID 기준 매핑으로 B2B 업체별 발주 엑셀을 생성한 뒤, 업체 송장 업로드와 쿠팡·토스 송장 등록까지 모바일 브라우저에서 처리합니다.

## 핵심 운영 순서
1. 쿠팡/토스 주문 수집
2. 옵션ID 기준 자동 매핑
3. 업체별 발주 ZIP 다운로드
4. 사용자가 업체에 발주 엑셀 업로드
5. 업체 송장 업로드
6. 송장 매칭 및 안전검증
7. 쿠팡·토스 송장 업로드
8. 쿠폰 자동화
9. 서버 저장용량 정리와 운영 로그 확인

## V180 정리 내용
- 불필요한 과거 버전 문서 중복본 제거
- 잘못된 직접 Ncloud HTTP fallback 코드 제거
- 별도 502 전용 점검 패널 제거
- 매핑 업로드 표준 7개 열 유지
- 앱 내장 XLSX 파서 유지

## 배포 기준
- Pages: https://b2b-bpt.pages.dev
- Worker: https://coupang-toss-b2b-automation.sosinche.workers.dev
- Pages 환경변수: `VITE_WORKER_URL=https://coupang-toss-b2b-automation.sosinche.workers.dev`
- Worker → Ncloud 중계 기준: `NCLOUD_API_BASE`

## 검증
```bash
npm run verify:all
npm run verify:git-safe
```

Windows PowerShell에서는 `npm.cmd`를 사용합니다.