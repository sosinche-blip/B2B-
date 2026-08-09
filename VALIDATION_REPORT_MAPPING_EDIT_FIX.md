# 확정매칭 수정저장 오류 수정 검증 보고서

작성일: 2026-08-09

## 수정 대상
- 이미 `확정 완료`된 AdminPlus 상품매칭의 발주시간/기본수량/배송비 재수정
- 자동추천 표에서 수정 후 `수정 확정`으로 재저장
- Supabase 공유 매핑 동기화에서 `purchaseTime` 보존
- AdminPlus 단일상품 매칭 수정 후 실제 상품/옵션/수량 재조회 검증

## 확인된 원인
1. 발주시간만 수정할 때 자동추천 행이 다시 `확정가능` 상태로 바뀌지 않음.
2. 공유 매핑 fingerprint에 `purchaseTime`이 없어 시간만 바뀐 경우 자동 동기화가 누락될 수 있음.
3. Worker `normalizeMappingRecord()`가 `purchaseTime`을 저장하지 않아 서버 저장/병합 후 09:00으로 복귀할 수 있음.
4. 기존 확정매칭의 재확정 경로가 AdminPlus 실제 수정 결과와 서버 영구저장값을 끝까지 대조하지 않음.

## 수정 내용
- 발주시간/기본수량/배송비 어느 하나라도 바뀌면 `수정 확정` 상태로 전환.
- 기존 확정 링크에서 qty/shippingFee/purchaseTime을 우선 복원.
- `수정 확정` 시 AdminPlus match apply를 다시 실행하고 상품코드/옵션코드/qty를 재조회 대조.
- 운영설정 저장 응답에서 mapping + adminplusProductLinks의 qty/shippingFee/purchaseTime을 재검증한 뒤에만 UI를 `확정 완료`로 전환.
- mapping fingerprint와 Worker mapping normalization에 purchaseTime 추가.
- Ncloud V206의 동일 Worker 코드에도 같은 backend 보강 적용.

## 검증 결과
- `scripts/verify_v214_mapping_edit_persistence.mjs`: 3 ROUND + 결정론적 시나리오 전부 PASS.
- 기존 V210, V211, V212, V213 검증 PASS.
- 기존 V203~V209 검증 중 실행한 항목 모두 PASS.
- Ncloud 신규 매칭수정 검증 PASS.
- Ncloud V204, V206 회귀검증 PASS.
- 전역 TypeScript CLI 기반 기준본/수정본 비교에서 새 오류 0건. 의존성 미설치 환경이라 Vite production build는 실행 불가(`vite: not found`).

## 대표 시나리오
- 옵션ID `95235689038`
- 배송비 0 -> 4000
- `수정 확정` 클릭
- AdminPlus 실제 매칭 재검증
- Supabase mapping.shippingFee = 4000 확인
- Supabase adminplusProductLinks.shippingFee = 4000 확인
- 화면 `확정 완료` 전환

발주시간 변경도 동일하게 mapping.purchaseTime + adminplusProductLinks.purchaseTime 두 저장값이 일치해야 완료 처리됩니다.
