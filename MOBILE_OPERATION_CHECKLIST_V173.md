# V173 모바일 운영 체크리스트

## 1. IP 등록 후에도 쿠팡 오류가 나는 경우

1. `운영설정 → IP 확인` 실행
2. IP가 이미 등록된 값이면 IP 항목은 통과
3. `운영설정 → 환경변수 점검` 실행
4. 쿠팡 설정 종합이 `정상`인지 확인
5. 쿠팡 키가 확인필요이면 Ncloud 또는 Cloudflare Secret에 실제 키를 다시 주입

## 2. 쿠팡 필수 환경변수

- `COUPANG_VENDOR_ID`
- `COUPANG_ACCESS_KEY`
- `COUPANG_SECRET_KEY`
- `COUPANG_ORDERS_PATH`

## 3. 토스 필수 환경변수

- `TOSS_CLIENT_ID`
- `TOSS_CLIENT_SECRET`
- `TOSS_ORDERS_PATH`

## 4. 실제 수집 전 Gate

- `API_CONNECTION_PAUSED=false`
- `ALLOW_LIVE_EXTERNAL_API=true`
- `ALLOW_FINAL_EXECUTION=true`

## 5. 정상 순서

1. 환경변수 점검 정상
2. IP 확인 값이 허용목록 등록값과 일치
3. 쿠팡 주문 진단
4. 토스 주문 진단
5. 주문 수집
6. 옵션ID 자동 매핑
7. 발주 ZIP 생성
8. 업체 송장 엑셀 업로드
9. 송장 안전검증 후 쿠팡·토스 송장 업로드
