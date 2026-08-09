# V216 기존확정 매칭 복구 + 발주시간 확정저장 검증

## 수정 원인
1. Ncloud AdminPlus `product_matches` 목록이 첫 500건만 조회되어 기존 매칭이 누락될 수 있었습니다.
2. B2B 확정 링크를 `optionId + accountId`로만 판단해, 같은 업체 계정을 재저장하여 accountId가 바뀌면 기존 확정을 신규 매칭으로 오판할 수 있었습니다.
3. 구버전에서 AdminPlus에는 1:1 매칭이 존재하지만 B2B 서버의 `adminplusProductLinks`가 누락된 경우 다시 `매칭 확정`을 요구했습니다.
4. 발주시간/배송비만 수정해도 AdminPlus 상품매칭 API를 다시 호출해, B2B 서버값 수정이 불필요하게 외부 API 성공 여부에 종속됐습니다.
5. 전체 설정 저장 시 클라이언트가 가진 `adminplusProductLinks`가 서버 전체 링크를 교체할 수 있어 일부 확정 링크가 사라질 위험이 있었습니다.

## 1차 검증 — 기존 확정 인식
- 동일 채널+옵션ID이며 업체명이 같은 기존 링크는 accountId 변경 후에도 확정으로 인식: PASS
- 서버 확정 링크가 있으면 `다시 매칭할 필요가 없습니다` 상태: PASS
- AdminPlus 실제 1:1 매칭과 서버 기본수량이 일치하면 누락된 B2B 링크만 자동 복구: PASS
- AdminPlus 실제 수량과 B2B 기본수량이 다르면 자동확정하지 않고 차이를 명시: PASS

## 2차 검증 — 발주시간 수정 확정
- 발주시간/배송비만 변경: AdminPlus match apply 미호출, B2B 서버 settings 저장만 수행: PASS
- 상품/옵션/기본수량 변경: AdminPlus 재적용 + 실제 상품/옵션/수량 재조회 검증 유지: PASS
- 서버 저장 후 `mappings.purchaseTime` + `adminplusProductLinks.purchaseTime` 재조회 일치 검증: PASS
- `09:00,14:00` 최대 2개 형식 유지: PASS

## 3차 검증 — 서버 링크 보존 / Ncloud 조회
- 서버 설정 저장 시 기존 `adminplusProductLinks`와 incoming을 option 링크 ID 기준 병합: PASS
- 누락된 링크가 클라이언트의 부분 저장으로 삭제되지 않음: PASS
- Ncloud product_matches cursor pagination(최대 20페이지): PASS
- Cloudflare Worker / Ncloud Worker TypeScript transpile syntax diagnostics 0: PASS
- 기존 V210/V211/V213/V214/V215 관련 회귀검증: PASS

## 배포 확인값
- version: `v213-per-option-payment-toss-mapping`
- featureRevision: `confirmed-match-time-commit-v216-20260809`

## 운영 확인 시나리오
1. `엑셀매핑 자동추천` 실행
2. 기존 확정 행은 `확정 완료` 유지 여부 확인
3. 기존 누락링크가 있으면 자동복구 건수 확인
4. 확정 완료 행의 발주시간을 `09:00,14:00`으로 변경
5. `수정 확정` 클릭
6. 성공 메시지에서 `서버 재조회 검증 완료` 확인
7. 새로고침 후 같은 발주시간 유지 확인
8. 공급가 변동 감시 표에도 동일 발주시간 표시 확인
