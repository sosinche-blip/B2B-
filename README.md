# B2B Operation V196

V196은 일상 운영 화면을 5개 메뉴로 정리하고, 쿠팡 OpenAPI 키 재발급 시 웹앱에서 새 Secret Key를 안전하게 교체할 수 있도록 만든 전체 배포본입니다.

## 화면 구성

1. 오늘운영: 주문조회·수집, 송장 선택·업로드, 일일 현황
2. 매핑·발주: 상품 매핑, 엑셀 양식, 발주 파일
3. 쿠폰: 반복대상 추가, 사전검증, 자동운영, 정액·정률, 즉시 적용
4. 자동화: 쿠폰 반복 시간과 저장소 정리
5. 설정: 쿠팡 Secret Key 교체와 접힌 고급 설정

기존 주문관리·양식설정·발주관리 화면은 기능을 삭제하지 않고 대표 작업공간으로 통합했습니다. 서버 저장, API 경로, 안전 Gate는 설정의 고급 영역에만 표시합니다.

## 인증키 교체 보안

- Secret Key와 관리 토큰은 localStorage에 저장하지 않습니다.
- 브라우저에서 Cloudflare Worker까지는 HTTPS만 사용합니다.
- Cloudflare Worker에서 Ncloud 게이트웨이로 전달할 때는 요청 본문을 AES-256-GCM으로 암호화합니다.
- Ncloud는 2분 유효시간과 일회용 nonce를 확인한 뒤 복호화합니다.
- 새 키로 쿠팡 주문조회 HTTP 200이 확인된 경우에만 `.dev.vars`를 백업하고 교체합니다.

## 배포 순서

1. `NCLOUD_FIXED_IP_GATEWAY_V195_CREDENTIALS_SECURE.zip`을 Ncloud에 먼저 배포
2. 이 웹 전체본을 GitHub/Cloudflare에 배포
3. 설정 → 쿠팡 API 인증키 교체에서 관리 토큰과 새 Secret Key 입력
4. 연결 테스트 후 저장하고 즉시 적용

자세한 순서는 `DEPLOY_V196_EASY.md`를 확인하세요.
