# 검증보고서 — 옵션별 2회 발주시간 / 서버확정 매핑 / B안 알림

검증일: 2026-08-09

## 변경 요구사항
1. API 상품매칭 표의 업체↔엑셀 연결정보 간격 축소
2. 기본수량/배송비 입력칸 약 50% 축소
3. 옵션별 발주시간 최대 2개 (`09:00,14:00`)
4. 편집값은 `수정 확정` 전까지 실제 서버 확정 운영값을 교체하지 않음
5. 자동감시 저장 실패와 가격 변동을 웹 화면 + 일일 운영점검판에서 알림(B안)

## 전용 검증
### Web V215 — 3 rounds PASS
- 최대 2개 시간 파싱/검증 PASS
- 쉼표 구분 UI PASS
- Worker 최대 2슬롯 정규화 PASS
- 스케줄러 2슬롯 확장 PASS
- 두 슬롯 중 어느 시간에서도 대상 주문 선택 PASS
- 임시 draft와 서버 확정값 분리 PASS
- `수정 확정` 후 서버 저장 + 재조회 검증 PASS
- 전체 자동감시 서버저장 시 미확정 draft 제외 PASS
- 운영점검판 자동감시 저장실패/가격변동 지표 PASS
- 업체↔엑셀 간격 및 수량/배송비 폭 축소 PASS

결정론적 시나리오:
- `09:00,14:00` 허용 PASS
- 3개 시간 차단 PASS
- 첫 슬롯 발주 완료 주문을 두 번째 슬롯에서 중복 발주하지 않음 PASS

### Web V214 매핑 수정저장 — 3 rounds PASS
- 발주시간/기본수량/배송비 수정 시 dirty 처리 PASS
- 기존 확정행 `수정 확정` 노출 PASS
- AdminPlus 재적용 PASS
- 서버 저장 후 재조회 일치 검증 PASS
- 배송비 0→4000 보존 PASS
- 2개 발주시간 서버 병합 보존 PASS

### Web V209~V213 회귀검증
- V209 PASS
- V210 PASS
- V211 PASS
- V212 PASS
- V213 PASS
- 일일 운영점검 상태흐름 전용검증 PASS

### Ncloud — 3 rounds / 회귀검증 PASS
- `verify_dual_time_alert_fix.mjs` PASS
- `verify_mapping_edit_persistence.mjs` PASS
- V204 shipping/baseQty/configured-cost PASS
- V205 coupon recovery PASS
- V206 payment/Toss/per-option schedule PASS

## 구문 검사
TypeScript 5.8.3 `transpileModule` 기준:
- Web `App.tsx`: SYNTAX OK
- Cloudflare Worker `worker.ts`: SYNTAX OK
- Ncloud Worker `worker.ts`: SYNTAX OK

## 현재 분석환경의 제한
Web 전체 `npm ci`/Vite production build는 내부 npm registry가 `zod@4.4.3` tarball을 404로 반환하여 수행하지 못했습니다. 이 때문에 `node_modules`가 없는 상태에서 `vite` 기반 `verify:local`/production build는 실행할 수 없습니다. 이는 소스 검증 실패가 아니라 의존성 미러 가용성 제한입니다.

일부 V200/V204 계열의 오래된 문자열 기반 검증기는 과거 UI 문구/시간 기준을 고정 문자열로 요구하여 최신 UI와 맞지 않는 항목이 있습니다. 이번 릴리스 판단은 V209~V215 및 전용 Ncloud 검증을 기준으로 수행했습니다.
