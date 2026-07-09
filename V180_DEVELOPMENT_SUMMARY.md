# V180 개발 요약

## 목적

V180은 기능을 늘리는 버전이 아니라, 사용자가 지적한 핵심 문제를 바로잡는 안정화 버전입니다.

- 발주 자동화앱의 단순한 파일 업로드 → 매핑 → 업체별 발주 ZIP 흐름을 유지
- 송장 입력기앱의 업체 송장 업로드 → 주문 매칭 → 쿠팡/토스 송장등록 흐름을 유지
- 현재 통합앱에서 발생한 화면 보호 모드 오류와 실제 `.dev.vars` 주입 확인 누락을 수정
- GitHub에는 보안값 없이 소스만 올리고, Ncloud 서버에서는 실제 `.dev.vars`를 읽어 운영하도록 정리

## 3회 검토 반영

### 1차: 발주 자동화앱 학습

첨부 발주 자동화앱은 브라우저에서 쿠팡/토스 주문 엑셀을 직접 올리고, 옵션ID 기준 설정DB로 업체명·상품명·수량을 매칭한 뒤 업체별 발주 파일과 ZIP을 만드는 구조입니다.

V180에서는 이 단순 흐름을 유지하고, PC 로컬 폴더 기능은 기본 운영이 아니라 보조 기능으로 둡니다.

### 2차: 송장 입력기앱 학습

첨부 송장 입력기앱은 쿠팡/토스 발송 엑셀과 B2B 업체 송장 엑셀을 업로드하고, 주문번호 → 성명+주소 앞 2단어 → 성명 → 상품명 2글자 이상 일치 순으로 매칭합니다.

V180에서는 “업체 송장 업로드” 용어를 유지하고, 이 기능이 B2B 업체가 보내준 송장 엑셀을 앱에 올리는 단계임을 그대로 반영합니다.

### 3차: 현재 통합앱 검토

현재 앱에서 화면 보호 모드가 발생한 원인은 API 502 자체보다, 실패 응답 후 화면 렌더링에서 안전하게 기본값을 쓰지 못한 코드가 남아 있었기 때문입니다.

V180에서는 다음을 수정했습니다.

- `Cannot read properties of undefined (reading '쿠팡')` 방지
- 수익 설정 기본값을 항상 안전하게 보정하는 `safeProfitSettings()` 추가
- 중복 선언된 `exportMobileOperationGuardReport()` 정리
- Ncloud 서버 기본 실행 포트를 8080으로 정리
- 실제 `.dev.vars`와 `apps/worker/.dev.vars`를 모두 병합 로드하도록 수정
- `check:env`가 `.dev.vars.example`이 아니라 실제 `.dev.vars` 파일만 점검하도록 수정

## 환경변수 처리 기준

GitHub에는 다음 파일을 올리지 않습니다.

- `.dev.vars`
- `.env`
- `.env.local`
- `apps/worker/.dev.vars`

Ncloud 서버에는 실제 값이 들어간 `.dev.vars`가 있어야 합니다.

서버에서 점검 명령은 다음입니다.

```bash
cd /root/b2b-operation
npm run check:env
```

이 명령은 실제 값을 출력하지 않고 `SET(length=숫자)` 형태로만 표시합니다.

## 검증 결과

- `npm run verify:all` 통과
- `npm run verify:git-safe` 통과
- Web production build 통과
- Worker TypeScript check 통과
