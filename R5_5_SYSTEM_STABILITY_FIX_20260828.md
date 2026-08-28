# V259 R5.5 전체 안정화 수정

이번 수정은 사용 중인 상품매칭·API매칭·R4.5 결제·R5.2 삭제·R5.3/R5.4 정책을 유지하면서 전체 운영 구조에서 확인된 고위험 정합성 문제를 수정합니다.

## 수정
- 앱 시작/최신설정 불러오기: DB에서 임의의 마지막 행 대신 `b2b-master-settings` 고정 운영키 사용
- Ncloud scheduler payload: 가장 최근 저장 행이 아니라 `b2b-master-settings`만 사용
- Cloudflare Cron 제거: Ncloud systemd timer를 단일 scheduler authority로 사용
- 가격확인 API가 `links: []`를 정상 반환하면 브라우저의 과거 API 링크도 0건으로 동기화
- 주문/수취인 정보가 포함될 수 있는 현재 작업상태는 localStorage가 아니라 sessionStorage에 저장, 기존 runtime localStorage는 1회 migration 후 삭제
- health/dashboard에 R5.3.3, R5.4, R5.5 revision 표시
- 오래된 쿠폰 23:51/스케줄러 안내 문구 수정

## 의도적으로 이번 패치에 포함하지 않은 항목
- Worker 전체 API 인증 강제: 현재 운영 UI가 모든 요청에 인증토큰을 전달하지 않으므로 즉시 강제하면 운영중단 위험이 있습니다. 별도 secret 배포와 UI 헤더 전환을 함께 해야 합니다.
- 전체 설정 optimistic-lock: 스키마/저장 UX 변경이 필요하므로 별도 단계로 구현해야 안전합니다.
- App.tsx/worker.ts 대규모 모듈 분리: 기능 변경과 섞지 않고 후속 리팩터링으로 진행하는 것이 안전합니다.
