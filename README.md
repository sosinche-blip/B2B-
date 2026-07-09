# B2B 쿠팡·토스 모바일 운영 자동화 앱

현재 버전: **V175_ATTACHMENT_REBASE_DEPLOY_READY**

V175는 모바일 Pages → Worker → Cloudflare Tunnel/Ncloud → 쿠팡·토스 API 실행경로를 명확히 보여주고, `VITE_WORKER_URL` 직접 HTTP 변경 금지, Ncloud outbound IP, 쿠팡·토스 환경변수 주입 여부, 임시 Tunnel 위험을 점검하는 안정화 버전입니다.

# B2B 쿠팡·토스 모바일 운영 자동화 앱

`V175_MOBILE_ENV_BINDING_GUARD`

## 1. 이번 버전 핵심

허용 IP가 이미 등록되어 있는데도 쿠팡 주문수집에서 `쿠팡 API 키가 설정되지 않았습니다`가 표시되는 문제를 분리 진단하도록 개선했습니다.

## 2. 바로 확인할 것

1. 모바일 화면 `운영설정 → 환경변수 점검` 실행
2. `쿠팡 설정 종합`, `COUPANG_VENDOR_ID`, `COUPANG_ACCESS_KEY`, `COUPANG_SECRET_KEY`가 정상인지 확인
3. IP가 이미 등록되어 있으면 IP 문제보다 서버 환경변수 주입 문제를 먼저 확인

## 3. 실행

```bash
npm install
npm run verify:all
PORT=8791 HOST=0.0.0.0 npm run start:ncloud
```

## 4. 주요 문서

- `DEPLOYMENT_GUIDE_V175.md`
- `MOBILE_OPERATION_CHECKLIST_V175.md`
- `V175_RELEASE_NOTES.md`
- `V175_DEVELOPMENT_SUMMARY.md`

## 5. 기존 모바일 운영 순서

1. 쿠팡/토스 주문 수집
2. 옵션ID 기준 자동 매핑
3. B2B 업체별 발주 엑셀 생성
4. 사용자가 업체에 발주 엑셀 업로드
5. 업체별 송장 엑셀 업로드
6. 주문번호 → 성명+주소 앞 2단어 → 성명 → 상품명 2글자 이상 일치 순 송장 매칭
7. 쿠팡·토스 송장 업로드 파일 생성 및 API 업로드
8. 쿠팡 즉시할인쿠폰 23:50 일괄 취소, 23:51 일괄 적용
9. 스케줄러와 서버 저장용량 자동 정리
