# V208 / Ncloud V202 3회 검증 보고서

검증일: 2026-08-08
기준본: 웹앱 V207 / Ncloud V201
대상: 웹앱 V208 AdminPlus 자동화 / Ncloud V202 AdminPlus 게이트웨이

## 1차 검증 — 기능 구조·공식 API 흐름·보안
- AdminPlus 다계정(Client ID/Secret) 등록·수정·삭제·연결시험 경로 확인
- AdminPlus Access Token 만료 전 자동갱신과 401 재발급 확인
- Toss Shopping Access Token `expires_in` 기반 캐시/자동갱신과 401 1회 재시도 확인
- AdminPlus `POST /v1/seller/orders`, `GET /v1/seller/orders/changed`, 상품문자열 매칭 사전조회 연결 확인
- 자동발주는 결제 API를 호출하지 않고 주문 등록만 실행하도록 확인
- AdminPlus 계정 비밀정보는 `/root/B2B_ADMINPLUS_ACCOUNTS.json`(0600) 보관, 웹브라우저 저장 금지 확인
- 인증정보 변경은 Cloudflare→Ncloud AES-256-GCM 보안 envelope 및 Ncloud 관리토큰을 통과하도록 확인
- AdminPlus `order.read` 권한이 없으면 계정 저장을 차단하도록 확인

## 2차 검증 — 회귀·타입·운영 안정성
- 기존 주소 무결성, 쿠폰 상태교차검증, 4단계 주문상태, 자동운영 시작, 옵션ID 쿠폰 중복판정 회귀검사 통과
- TS/TSX 18개 파일 구문검사: 오류 0건
- 의존성 없는 동일 조건 TypeScript 비교: V207/V201 대비 신규 타입 오류 0건
  - Web App: 기준 48 / V208 48 / 신규 0
  - Worker: 기준 15 / V208 15 / 신규 0
  - Ncloud Node: 기준 27 / V202 27 / 신규 0
  - 위 숫자는 의존성이 없는 부분검사 환경의 기존 미해결 의존성 오류를 포함한 상대비교 값임
- 동일 협력사·상품문자열의 매칭조회는 실행당 캐시하여 AdminPlus Rate Limit 부담 감소
- 주문등록 응답 불확실/중복 충돌 시 `customer_order_code` 조회로 실제 등록 여부를 복구하여 중복 발주 방지
- 스케줄 작업 실패는 같은 허용시간 안에서 재시도하며 성공 발주이력은 다시 등록하지 않도록 확인

## 3차 검증 — 송장 자동화·중복 방지·배포 안전성
- AdminPlus 변경주문의 `shipping_company`/`tracking_number`를 기존 쿠팡·토스 송장등록 파이프라인으로 전달 확인
- 1:N 매칭에서 일부 상품만 송장이 생기거나 서로 다른 송장이 확인되면 자동등록을 보류하여 잘못된 단일 송장 전송 방지
- 감지한 송장은 발주이력에 pending으로 저장하여 마켓 등록 실패 후에도 다음 실행에서 재시도 가능
- 성공한 송장 행만 `shipmentUploadedAt`으로 완료 처리하여 부분 실패 시 성공/실패를 분리
- AdminPlus 변경분 watermark는 안전하게 변경분을 읽었을 때만 전진하도록 확인
- Ncloud 배포 스크립트 `bash -n` 통과, systemd 백업 타이머 유지, 실패 시 기존 서비스 복구 흐름 확인
- 실제 키/Client Secret/.dev.vars/PEM 파일이 배포본에 포함되지 않도록 점검

## 현 환경에서 완료하지 못한 검증
현재 ChatGPT 작업환경의 내부 npm 미러가 `zod@4.4.3` 파일을 404로 반환하여 `npm ci` 기반 전체 프로덕션 빌드는 이 환경에서 완료할 수 없었습니다. 실제 Ncloud 업그레이드 스크립트와 GitHub Actions에서 `npm ci`/빌드를 다시 수행하도록 구성했습니다.

또한 사용자의 실제 AdminPlus Client ID/Secret을 제공받지 않았으므로 **실제 10개+ 셀러 계정에 대한 라이브 주문 등록·송장 업로드는 배포 전에 실행하지 않았습니다.** 배포 후 각 계정 `전체 연결·만료 확인` → `발주 사전검증` → `송장 사전확인` → 소량 수동 테스트 순으로 검증해야 합니다.

## 중요한 운영 제한
AdminPlus 공식 API는 주문 등록과 결제 접수를 별도 단계로 제공합니다. V208 자동발주는 안전을 위해 `POST /v1/seller/orders` 주문 등록까지만 자동화하며 예치금/적립금/무통장 결제 접수는 실행하지 않습니다. 결제 자동화가 필요하면 결제수단·한도·승인정책을 별도로 정의한 뒤 별도 버전으로 구현해야 합니다.
