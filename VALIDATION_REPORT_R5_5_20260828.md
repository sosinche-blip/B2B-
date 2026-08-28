# V259 R5.5 전체 안정화 검토·수정 결과

## 검토 범위
첨부된 B2B 전체 소스에서 Web(App.tsx), Worker(worker.ts), wrangler 설정, 기존 검증 스크립트를 대상으로 4회 관점 검토를 수행했습니다.

### 1차: 서버 source-of-truth / 설정 정합성
- 앱 시작 시 임의의 DB 최신 설정행을 읽던 경로를 `b2b-master-settings` 고정 운영키로 변경.
- Ncloud scheduler가 DB의 가장 최근 저장행을 실행하던 로직을 `b2b-master-settings` 고정키 조회로 변경.
- 가격확인 API가 정상적으로 `links: []`를 반환할 때 브라우저의 과거 링크가 남는 문제 수정.

### 2차: 자동화 / 중복 실행
- Cloudflare `* * * * *` cron 제거.
- 현재 운영 중인 Ncloud systemd timer를 단일 scheduler authority로 사용하도록 정리.
- 오래된 23:51 쿠폰 안내를 23:50 종료 / 23:52 발행 / 23:57·23:58 복구확인 정책으로 교정.
- 스케줄러 설명을 실제 AdminPlus 발주·가격확인·송장 + 쿠폰 + 저장소 정리 범위로 교정.

### 3차: 브라우저 개인정보 / 상태 저장
- 주문/수취인 정보가 포함될 수 있는 현재 작업상태 `STORAGE_KEY`를 localStorage에서 sessionStorage로 변경.
- 기존 localStorage runtime 상태는 1회 sessionStorage로 이관 후 삭제.
- 장기 설정용 `SETTINGS_STORAGE_KEY`는 기존 동작을 유지.

### 4차: 매핑/가격/운영 UI 회귀
- R5.3.2 identity-change-only 유지.
- R5.3.3 서버 확정 API 링크 복구 우선순위 유지.
- R5.4 가격 최종변경시각 유지.
- 사전검증 `옵션ID / 매칭경로 / API확정 후보` 진단 UI 유지.
- `/api/health`, `/api/system/status`, `/api/dashboard`에 R5.3.3/R5.4/R5.5 revision 표시.

## 검증
- `verify:v259r5.5`: PASS
- `audit:v259r5.5`: 4회 관점 전 항목 PASS
- 기존 정적 verifier 중 dependency-free 24개 세트 PASS:
  V250, V246, V247, V248R7.1, V248R9.2, V253~V259, R2/R3/R4/R4.2/R4.4/R4.5, R5/R5.2/R5.3/R5.4/R5.5
- 이 실행 환경에서는 npm 전체 설치가 시간 제한으로 완료되지 않아 `verify:address`/Web Vite build/Worker full typecheck는 최종 실행하지 못했습니다. 사용자의 Windows 운영 저장소에서는 배포 전 `npm ci`, `verify:all`, `typecheck:worker`, `build`를 다시 실행해야 합니다.

## 호환성 때문에 강제 적용하지 않은 항목
1. Worker 운영 API 전체 인증 강제
   - 현재 Web의 모든 API 호출이 공통 관리자 토큰을 보내는 구조가 아니므로 즉시 강제하면 운영 중단 가능성이 있습니다.
   - 별도 Worker secret 설정 + Web 공통 Authorization 전환을 함께 하는 다음 보안 버전에서 적용 권장.
2. 전체 설정 optimistic locking
   - 여러 PC의 비매핑 설정 snapshot 충돌을 완전히 막으려면 server revision 및 저장 UX 변경이 필요합니다.
3. App.tsx/worker.ts 모듈 분리
   - 기능 안정화와 대규모 리팩터링을 동시에 하지 않기 위해 후속 버전으로 분리합니다.

## 배포 주의
- 이번 버전은 Worker와 Web, wrangler.toml이 모두 변경되었습니다.
- Cloudflare Worker 배포 후 Ncloud 운영 폴더의 `apps/worker/src/worker.ts`도 동일 SHA로 동기화해야 합니다.
- Cloudflare cron은 제거되어야 하며 Ncloud `b2b-coupon-scheduler-tick.timer`가 `active`인지 확인하십시오.
