# V217 API 매핑 확정 / 엑셀 옵션ID·기본수량 원본 유지 검증

## 이번 화면 오류의 실제 원인
1. `Error: success`는 AdminPlus POST 저장 응답은 성공했지만 직후 재조회가 이전 값을 반환하거나, 검증값이 달라 `ok:false`가 된 상태에서 응답 message의 `success` 문자열을 오류문구로 그대로 표시한 문제였습니다.
2. `활 바지락 1kg`처럼 같은 업체상품명을 옵션ID 95235689038/039/040이 공유하면서 기본수량 5/2/1을 요구하면 기존 구조의 하나의 AdminPlus `match_string` qty를 서로 덮어쓸 수 있었습니다.
3. 성공 처리 뒤에도 `adminplus_watch_save`의 과거 채널별 실패가 서버에 남아 상단의 `자동감시 서버 저장 실패 n건` 배너가 다시 나타날 수 있었습니다.
4. 앞서 언급한 500건은 AdminPlus `product_matches` API의 1페이지 조회 크기 문제이며, 현재 B2B 엑셀 매핑이 50건 미만인 사실 자체와는 별개입니다. 이번 화면 오류의 주원인은 500건이 아니라 위 1~3번입니다.

## 수정
- B2B 자동발주용 AdminPlus 매칭문자열을 `B2B:CP:<옵션ID>` / `B2B:TS:<옵션ID>`로 옵션ID별 독립 관리.
- API 매핑의 옵션ID와 기본수량은 서버에 저장된 엑셀 매핑 `mapping.optionId / mapping.baseQty`를 기준값으로 사용.
- 같은 업체상품명을 여러 옵션ID가 공유해도 서로 다른 기본수량이 덮어써지지 않음.
- 기존 단독 match_string은 그대로 재사용하고, 공유 충돌 또는 수량 불일치가 있는 기존 링크만 1회 옵션별 독립 매칭으로 전환.
- AdminPlus 저장 후 0/250/750/1500ms 최대 4회 재조회해 eventual consistency 대응.
- `success`, `ok`, `true` 같은 성공 문자열을 실패 메시지로 표시하지 않고 요청값/재조회값 차이를 표시.
- 자동발주 런타임은 `channel|optionId` 확정 링크의 `matchString`을 사용하고 Excel baseQty와 AdminPlus 옵션별 qty를 다시 대조.
- 성공 시 과거 `adminplus_watch_save` 실패 상태를 함께 해결 상태로 서버 저장.

## 1차 검증 — 엑셀 source of truth
- 채널+옵션ID별 독립 match string: PASS
- API 추천 기본수량 = 엑셀 mapping.baseQty: PASS
- 동일 업체상품명 다중 옵션ID 충돌 탐지: PASS
- UI `기본수량(엑셀)` 표시: PASS

## 2차 검증 — 수정 확정
- legacy 공유매칭 → 옵션별 독립매칭 변경감지: PASS
- AdminPlus 저장 후 최대 4회 재조회: PASS
- `Error: success` 오표시 제거: PASS
- 실패 시 요청 상품/옵션/수량과 재조회 상품/옵션/수량 표시: PASS
- 서버 save → reload 검증 유지: PASS

## 3차 검증 — 자동발주 / 운영점검
- 자동발주가 per-option 확정 link 사용: PASS
- 주문 product_string이 확정 link.matchString 사용: PASS
- Excel baseQty와 AdminPlus qty 불일치 시 차단: PASS
- 성공 후 과거 자동감시 저장실패 해결 처리: PASS
- 기존 2회 발주시간/결제/상품준비중 안전장치 회귀검증: PASS
- App.tsx / Cloudflare Worker / Ncloud Worker TypeScript transpile syntax errors: 0

## 배포 확인값
- version: `v213-per-option-payment-toss-mapping`
- featureRevision: `option-baseqty-confirm-v217-20260809`
