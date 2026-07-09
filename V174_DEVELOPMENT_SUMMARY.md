# V174 Development Summary

## 1. 개발 방향
V174는 기능 추가보다 실운영 안정화를 위한 실행경로 명확화 버전입니다. 사용자가 이미 확인한 쿠팡 HTTP 200, 토스 HTTP 200, Ncloud outbound IP 101.79.27.234 상태를 기준으로 모바일 운영 화면에서 무엇을 봐야 하는지 분리했습니다.

## 2. 반영 내용

1. `APP_VERSION`을 `V174_MOBILE_RUNTIME_PATH_CLARITY`로 변경
2. 모바일 간편운영에 `V174 실행경로 점검` 패널 추가
3. `GET /api/system/runtime-path` API 추가
4. `VITE_WORKER_URL` 직접 HTTP 변경 금지 안내 추가
5. `NCLOUD_API_BASE`와 임시 `trycloudflare.com` Tunnel 상태 진단 추가
6. `업체 송장 업로드` 용어 유지 및 설명 보강
7. 검증 스크립트를 V174 기준으로 갱신

## 3. 3회 검토 반영

1. 업무 흐름 검토
   - 주문수집, 매핑, 발주 ZIP, 업체 발주 업로드, 업체 송장 업로드, 송장 매칭, 쿠팡·토스 업로드 순서를 유지했습니다.

2. 모바일 운영성 검토
   - PC 로컬폴더를 기본 기능으로 오해하지 않도록 실행경로와 직접 HTTP 금지 문구를 전면에 배치했습니다.

3. 장애 원인 분리 검토
   - IP 등록 문제, API 키 미주입 문제, 임시 Tunnel 문제, 브라우저 HTTPS/HTTP 차단 문제를 각각 구분하도록 했습니다.
