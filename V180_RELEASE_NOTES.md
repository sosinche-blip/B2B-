# V180_RELEASE_NOTES

## 버전명

`V180_SERVER_ENV_BINDING_AND_SIMPLE_OPERATION_FIX`

## 수정사항

### 화면 오류 수정

- API 502 또는 수집 실패 후 화면 보호 모드로 넘어가던 문제를 수정했습니다.
- `Cannot read properties of undefined (reading '쿠팡')` 오류를 방지했습니다.
- 수익 설정 객체가 비정상이어도 기본 쿠팡/토스 설정으로 보정합니다.

### 실제 `.dev.vars` 점검 수정

- `.dev.vars.example`이 아니라 실제 `.dev.vars`와 `apps/worker/.dev.vars`를 기준으로 점검합니다.
- Ncloud 서버 시작 시 여러 환경파일 후보를 모두 읽고 병합합니다.
- 환경변수 점검 결과는 마스킹된 상태로만 표시합니다.

### 서버 운영 기준 정리

- Ncloud 서버 기본 API 포트를 8080으로 맞췄습니다.
- `npm run start:ncloud` 실행 시 실제 환경파일 로드 출처를 로그에 표시합니다.
- GitHub 업로드용 ZIP에는 보안값이 들어가지 않도록 유지했습니다.

### 유지 기능

- 주문 수집
- 옵션ID 자동 매핑
- 업체별 발주 ZIP 다운로드
- 업체 송장 업로드
- 송장 매칭
- 쿠팡·토스 송장 등록
- 쿠폰 자동화
- 서버 정리
