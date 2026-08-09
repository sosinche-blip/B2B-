# V217 R1 Cloudflare Worker TypeScript 핫픽스 검증

## GitHub Actions 실패 원인
- 실패 위치: `apps/worker/src/worker.ts` 약 4397행
- 오류: `Property 'updatedAt' does not exist on type '{ id: string; channel: string; optionId: string; }'.`
- 원인: `mergeAdminPlusProductLinkRecords()` 내부의 `normalized` 객체가 TypeScript에서 너무 좁은 객체 타입으로 추론되어 `updatedAt` 동적 필드를 읽지 못함.

## 수정
```ts
const normalized: Record<string, unknown> = { ...row, id, channel, optionId };
```
- 실제 데이터 구조는 기존처럼 모든 서버 링크 필드를 보존함.
- 병합/updatedAt 비교 로직은 변경하지 않음.
- 런타임 featureRevision은 `option-baseqty-confirm-v217-20260809` 유지.

## 1차 검증 — 타입 핫픽스
- 명시적 indexable 타입 존재: PASS
- `updatedAt` 비교 유지: PASS

## 2차 검증 — 병합 회귀
- existing/incoming 링크 병합 유지: PASS
- channel+optionId 링크 ID 유지: PASS

## 3차 검증 — V217/V216/V215/V214 회귀
- V217 옵션ID/엑셀 기본수량/확정저장 검증: PASS
- V216 기존확정/발주시간 저장 검증: PASS
- V215 2회 발주/서버락/B알림 검증: PASS
- V214 매핑 수정저장 검증: PASS

## 전체 TypeScript 재현 환경 제한
현재 분석 컨테이너의 내부 npm 미러에는 `zod@4.4.3` tarball이 없어 `npm ci`를 완료할 수 없었습니다. 대신 GitHub가 보고한 정확한 타입 오류 지점을 수정하고, 전용 소스 검증과 기존 회귀검증을 수행했습니다. 실제 GitHub Actions의 `npm ci` + TypeScript 검사가 최종 확인 단계입니다.
