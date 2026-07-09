# V172 개발 요약

## 1. 버전명
`V172_MOBILE_SHIPMENT_SAFETY_LOCK`

## 2. 개발 방향
V170은 모바일 매핑 운영, V171은 모바일 작업순서 보호에 집중했습니다. V172는 송장 API 업로드 전 마지막 검증 장치를 추가하여, 모바일 운영자가 잘못된 송장을 쿠팡·토스에 등록하는 위험을 줄이는 데 집중했습니다.

## 3. 코드 반영 내역

### 3.1 Web 앱
수정 파일: `apps/web/src/App.tsx`

- `APP_VERSION`을 `V172_MOBILE_SHIPMENT_SAFETY_LOCK`으로 변경
- `ShipmentSafetyLevel`, `ShipmentSafetyRow` 타입 추가
- `buildShipmentSafetyRows()` 추가
- `shipmentSafetySummary()` 추가
- `shipmentSafetyRowsToSheet()` 추가
- `exportShipmentSafetyReport()` 추가
- 간편운영 화면에 `V172 송장 업로드 안전검증` 패널 추가
- 송장 차단 발생 시 업로드 버튼 잠금 처리
- `runShipmentUploadAll()` 내부 API 호출 직전 안전검증 차단 로직 추가

### 3.2 검증 스크립트
수정 파일: `scripts/verify_service_completion.mjs`

- V172 필수 문서 확인
- V172 버전 문자열 확인
- 안전검증 관련 코드 스니펫 확인
- Web build 및 Worker TypeScript check 유지

### 3.3 문서
추가 파일:

- `DEPLOYMENT_GUIDE_V172.md`
- `MOBILE_OPERATION_CHECKLIST_V172.md`
- `V172_RELEASE_NOTES.md`
- `V172_DEVELOPMENT_SUMMARY.md`

## 4. 송장 안전검증 기준

### 4.1 차단
- 쿠팡 필수ID 누락: 묶음배송번호, 주문번호, 옵션ID
- 토스 필수ID 누락: 주문상품번호
- 택배사 또는 운송장번호 누락
- 중복후보확인, 확인필요, 미매칭
- 동일 운송장번호가 서로 다른 수취인에게 연결

### 4.2 주의
- 상품명 2글자 단독 매칭
- 성명 단독 매칭
- 동일 수취인의 복수 주문에 같은 운송장번호 사용
- 등록준비 외 행은 업로드 제외 확인

## 5. 검증 결과
실행 명령:

```bash
npm run verify:all
```

결과:

- Web production build 성공
- Worker TypeScript check 성공
- V172 service verification 성공
