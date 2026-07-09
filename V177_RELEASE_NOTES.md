# V177_RELEASE_NOTES

## 주요 변경

1. 매핑 업로드 표준 양식을 사용자가 첨부한 7개 열 구조로 정리했습니다.
2. 매핑양식 다운로드 파일명을 `B2B_매핑양식_V177.xls`로 변경했습니다.
3. xlsx 업로드 시 외부 CDN 라이브러리 실패를 대비한 경량 xlsx 파서를 추가했습니다.
4. 매핑 업로드 실패 메시지에 표준 열 안내를 명확히 표시했습니다.
5. HTTP 502 JSON 파싱 실패를 Worker/Tunnel/Ncloud 경로 문제로 안내하도록 개선했습니다.
6. Worker에 `/api/system/api-gateway-check` 진단 API를 추가했습니다.
7. 간편운영 화면에 `API 502 점검` 버튼을 추가했습니다.

## 유지 사항

- `업체 송장 업로드` 용어는 그대로 유지했습니다.
- Pages 환경변수는 `VITE_WORKER_URL=https://coupang-toss-b2b-automation.sosinche.workers.dev` 기준입니다.
- 쿠팡·토스 허용 IP 기준은 Ncloud outbound IP `101.79.27.234`입니다.
