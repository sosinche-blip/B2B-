# V178_RELEASE_NOTES

## 주요 변경

1. 매핑 업로드 표준 양식을 사용자가 첨부한 7개 열 구조로 정리했습니다.
2. 매핑양식 다운로드 파일명을 `B2B_매핑양식_V178.xls`로 변경했습니다.
3. xlsx 업로드 시 외부 CDN 라이브러리 실패를 대비한 경량 xlsx 파서를 추가했습니다.
4. 매핑 업로드 실패 메시지에 표준 열 안내를 명확히 표시했습니다.
5. HTTP 502 JSON 파싱 실패를 Worker/Tunnel/Ncloud 경로 문제로 안내하도록 개선했습니다.
6. Worker에 `/api/system/api-gateway-check` 진단 API를 추가했습니다.
7. 간편운영 화면에 `API 502 점검` 버튼을 추가했습니다.

## 유지 사항

- `업체 송장 업로드` 용어는 그대로 유지했습니다.
- Pages 환경변수는 `VITE_WORKER_URL=https://coupang-toss-b2b-automation.sosinche.workers.dev` 기준입니다.
- 쿠팡·토스 허용 IP 기준은 Ncloud outbound IP `101.79.27.234`입니다.

## V178 추가 보강

- 매핑 엑셀 업로드 안정화: `xlsx` 라이브러리를 웹 번들에 포함하여 jsdelivr/CDN 차단으로 인한 매핑 업로드 실패를 줄였습니다.
- 표준 매핑 양식 유지: `채널 / 옵션ID / 업체명 / 코드번호 / 업체상품명 / 원가 / 기본수량` 7개 열을 기준으로 읽습니다.
- 매핑 업로드 후 현재 주문 기준 매칭완료/미매핑 건수를 즉시 재계산합니다.
- 쿠팡진단·토스진단·IP확인에서 HTTP 502가 발생해도 화면 보호 모드로 떨어지지 않도록 진단표에 오류 행을 남깁니다.
- Worker가 `NCLOUD_API_BASE` 임시 Tunnel에 실패할 경우 `NCLOUD_DIRECT_API_BASE=http://101.79.27.234:8080` 직접 중계를 추가로 시도하도록 보강했습니다.
- Worker→Ncloud 중계가 모두 실패하면 JSON 502를 반환하여 브라우저의 `JSON 파싱 실패` 혼선을 줄입니다.
