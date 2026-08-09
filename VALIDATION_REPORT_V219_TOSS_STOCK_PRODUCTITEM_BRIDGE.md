# V219 토스 stockId/productItemId 브리지 검증보고서

## 1차 — 식별자 모델
- 웹 옵션 마스터가 stockId와 productItemId(optionId)를 별도 보존: PASS
- 상품 상세 stocks[]의 id/itemId/managementCode 파싱: PASS
- 상품 상세 API를 이용한 stockId→productItemId 브리지: PASS

## 2차 — 웹 주문 정규화
- productId+stockId 우선 조회: PASS
- stockId 단독 조회: PASS
- 관리코드 fallback 유지: PASS
- 수집된 Toss 주문 optionId를 productItemId로 정규화: PASS

## 3차 — Ncloud 자동발주
- legacy 직접 키보다 stockId→productItemId 브리지를 먼저 적용: PASS
- 브리지 미보유 시 productId 상품 상세 live fallback: PASS
- 한 실행에서 같은 productId 중복 조회 방지: PASS
- 발견한 브리지 행을 scheduler payload에 보존: PASS
- AdminPlus 자동발주가 옵션별 확정 링크를 사용: PASS
- 엑셀 baseQty 불일치 사전 차단 유지: PASS
- 두 번째 발주시간 중복주문 차단 유지: PASS

## 회귀검증
- Web V213/V214/V215/V216/V217/V217R1/V218/V218R1/V219: PASS
- Ncloud V204/V205/V206/dual-time/confirmed-match-time/option-baseqty/single-option/mapping-edit/toss-bridge: PASS
- App.tsx / Cloudflare worker.ts / Ncloud worker.ts TypeScript transpile syntax diagnostics: 0

## 식별 리비전
`tossBridgeRevision = toss-stock-productitem-v219-20260809`
