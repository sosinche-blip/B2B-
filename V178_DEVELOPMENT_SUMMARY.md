# V178 개발 요약

## 개발명

V178_MAPPING_UPLOAD_STABILITY_AND_NCLOUD_PROXY_GUARD

## 반영 배경

사용자 화면에서 쿠팡진단, 토스진단, IP확인이 모두 HTTP 502로 실패했습니다. 이 오류는 쿠팡·토스 API 응답이라기보다 Cloudflare Worker, Tunnel, Ncloud API 서버 실행경로 문제일 가능성이 높습니다. 또한 사용자가 실제 매핑 양식 xlsx를 첨부했으므로 해당 7개 열 구조를 표준으로 맞췄습니다.

## 반영 내용

- 매핑 표준 열: 채널, 옵션ID, 업체명, 코드번호, 업체상품명, 원가, 기본수량
- xlsx 경량 파서 추가
- 매핑 업로드 오류 안내 보강
- API 502 점검 API 추가
- API 502 점검 버튼 추가
- 쿠팡진단/토스진단/IP확인 502 오류 메시지 개선

## 검증

- Web production build
- Worker TypeScript check
- V178 service verification
- GitHub upload safety check

## V178 개발 요약 추가

1. 매핑 업로드 오류 대응
   - 첨부 엑셀 `자동화 양식 옵션 번호 설정 파일(수정)(3).xlsx`의 실제 구조를 확인했습니다.
   - 실제 헤더는 `채널, 옵션ID, 업체명, 코드번호, 업체상품명, 원가, 기본수량`이며, V178 표준 매핑양식과 일치합니다.
   - 업로드 실패 가능성이 큰 외부 CDN 로딩 의존을 제거하고 `xlsx`를 앱 번들에 포함했습니다.

2. 502 오류 대응
   - 현재 화면의 HTTP 502는 쿠팡/토스 API 업무 오류라기보다 Worker→Tunnel/Ncloud 연결 오류입니다.
   - V178에서는 Worker가 먼저 `NCLOUD_API_BASE`로 중계하고, 실패 시 `NCLOUD_DIRECT_API_BASE`로 재시도합니다.
   - 두 경로 모두 실패하면 원인과 점검 명령을 포함한 JSON 오류를 반환합니다.

3. 화면 보호 모드 대응
   - API 진단 실패 시 `apiDiagnosticRowsFromError`로 진단표를 채우도록 보강했습니다.
   - `Cannot read properties of undefined` 유형의 연쇄 오류를 줄이기 위해 실패 응답을 표준 진단행으로 분리했습니다.
