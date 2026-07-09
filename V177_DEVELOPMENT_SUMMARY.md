# V177 개발 요약

## 개발명

V177_MAPPING_UPLOAD_AND_API_502_GUARD

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
- V177 service verification
- GitHub upload safety check
