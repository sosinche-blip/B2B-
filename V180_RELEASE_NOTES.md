# V180 Worker DNS 호스트 게이트웨이

## 목적
Cloudflare Worker가 원본 서버를 IP 리터럴(http://101.79.27.234:8080)로 호출할 때 HTTP 403 / Cloudflare 1003 오류가 발생하는 문제를 우회합니다.

## 변경 사항
- Worker 원본 API 주소를 IP 리터럴에서 DNS 호스트로 변경
  - 이전: http://101.79.27.234:8080
  - 이후: http://101.79.27.234.sslip.io:8080
- Pages 화면 버전을 V180로 변경
- 오류 안내 문구를 DNS 호스트 게이트웨이 기준으로 변경
- V176 주문관리 단순화 및 수집초기화 유지
- V175 Supabase 매핑 서버 저장 안정화 유지

## 확인 기준
- Worker 루트 응답 ncloudApiBase가 http://101.79.27.234.sslip.io:8080 으로 표시되어야 합니다.
- /api/system/public-ip 호출에서 ok:true 및 outboundIp:101.79.27.234 가 나와야 합니다.
