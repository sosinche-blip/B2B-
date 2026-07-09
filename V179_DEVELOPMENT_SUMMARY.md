# V179 개발 요약

V179는 사용자가 지적한 “불필요한 파일 삭제, 잘못된 코딩 삭제” 요청에 맞춘 정리 버전입니다.

## 1. 삭제한 잘못된 보강
- `NCLOUD_DIRECT_API_BASE` 직접 fallback
- `NCLOUD_DIRECT_FALLBACK_ENABLED`
- 별도 `/api/system/api-gateway-check` 라우트
- 화면의 `API 502 점검` 버튼과 결과표

## 2. 삭제한 불필요 파일
- V169~V178 과거 문서 중복본
- 과거 GitHub 업로드 가이드 중복본
- Windows CMD 시작 보조파일

## 3. 유지한 기능
- V177 매핑 양식 7개 열
- 앱 내장 XLSX 파서
- 실행경로 점검
- 배포 점검
- 환경변수 점검
- 주문/발주/송장/쿠폰/스케줄러 기본 흐름

## 4. 검증
- `npm run verify:all`
- `npm run verify:git-safe`
