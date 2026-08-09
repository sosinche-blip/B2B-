# V222 3회 검증 보고서

## 1차 — 수동 backlog 처리
- manual/scheduled 실행 분리: PASS
- 수동 실행 startedAt 컷오프 해제: PASS
- 예약 스케줄 startedAt 보호 유지: PASS

## 2차 — 서버 확정값 source-of-truth
- 서버 persistent settings 선조회: PASS
- mappings/productLinks/purchaseHistory 서버값 우선: PASS
- 브라우저의 오래된 확정자료 덮어쓰기 차단: PASS

## 3차 — 회귀/진단
- V217 option/baseQty: PASS
- V218 AdminPlus option: PASS
- V219 Toss bridge: PASS
- V220 Toss link alias: PASS
- V221 Toss PAID fallback: PASS
- 수집/후보/실행가능/제외사유 진단: PASS
- App/Cloudflare Worker/Ncloud Worker TypeScript transpile syntax errors: 0
