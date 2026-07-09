# V174_MOBILE_RUNTIME_PATH_CLARITY Release Notes

## 1. 핵심 변경

1. V174 실행경로 점검 화면 추가
   - 모바일 Pages, Worker, Ncloud API, outbound IP, Tunnel 상태를 한 화면에서 확인합니다.

2. 신규 API 추가
   - `GET /api/system/runtime-path`
   - 실행 런타임, Worker 기준, Ncloud 내부 API 기준, 허용 IP 기준, Tunnel 임시주소 여부를 반환합니다.

3. 업체 송장 업로드 용어 유지
   - 버튼과 단계명은 사용자 요청대로 `업체 송장 업로드`를 유지했습니다.
   - 설명 문구는 “업체가 보내준 송장 엑셀을 앱에 올리는 단계”로 보강했습니다.

4. 직접 HTTP API 연결 차단 안내 강화
   - `VITE_WORKER_URL`을 `http://101.79.27.234:8080`으로 바꾸지 않도록 화면과 문서에 반영했습니다.

5. 환경변수 진단 보강
   - `NCLOUD_API_BASE` 표시
   - 임시 `trycloudflare.com` Tunnel 감지 시 확인필요로 표시

## 2. 검증

- Web production build
- Worker TypeScript check
- V174 service verification

## 3. 주의

이 버전은 실제 쿠팡·토스 운영 API를 새로 호출해 재검증한 버전이 아닙니다. 제공된 연결 상태, 배포 구조, 첨부된 V173 결과물을 기준으로 모바일 실운영 혼선을 줄이는 코드 보강 버전입니다.
