# V180 모바일 운영 점검표

## 운영 전 필수 확인

| 항목 | 정상 기준 |
|---|---|
| 앱 버전 | V180_SERVER_ENV_BINDING_AND_SIMPLE_OPERATION_FIX |
| Pages 주소 | https://b2b-bpt.pages.dev |
| Worker 주소 | https://coupang-toss-b2b-automation.sosinche.workers.dev |
| Ncloud API | 127.0.0.1:8080 실행 |
| 실제 호출 IP | 101.79.27.234 |
| 환경변수 | 실제 .dev.vars 기준 OK |

## 작업순서

1. 쿠팡/토스 주문 수집
2. 옵션ID 기준 자동 매핑
3. 업체별 발주 ZIP 다운로드
4. 사용자가 업체에 발주 엑셀 업로드
5. 업체 송장 업로드
6. 송장 매칭
7. 쿠팡·토스 송장 등록
8. 쿠폰 자동화
9. 서버 정리

## 매핑 양식

| 채널 | 옵션ID | 업체명 | 코드번호 | 업체상품명 | 원가 | 기본수량 |
|---|---|---|---|---|---:|---:|

## 화면 오류 재발 시 확인

- 새로고침 후 재실행
- 환경변수 점검 결과 확인
- Ncloud 서버 8080 실행 여부 확인
- Worker의 NCLOUD_API_BASE가 현재 유효한 주소인지 확인
