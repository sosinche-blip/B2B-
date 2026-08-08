# V212 검증 보고서

검증 대상: 웹앱/Cloudflare Worker V212  
기준본: V211

## 1차 — AdminPlus 기본수량·배송비 수동 수정
- 자동추천 결과의 기본수량/배송비 숫자 입력 UI 확인.
- 확정된 상품매칭 목록에서도 직접 수정 + `수량·배송비 저장` 확인.
- 기본수량 변경 시 AdminPlus `products[].qty` 재저장 경로 확인.
- 기본수량/배송비를 기존 매핑 및 서버설정에 함께 저장하는 경로 확인.
- 구성원가 재계산 확인.
- V211 바지락 구성원가 회귀검증 통과.

## 2차 — 종료된 반복쿠폰 복구발행
- 저장 couponId가 없어도 수동 `지금 쿠폰 교체`가 차단되지 않음.
- 저장 couponId가 이미 종료되어 실제 APPLIED 옵션 소유쿠폰이 0개이면 `alreadyInactive/noActiveAppliedCoupon`으로 취소를 정상 생략.
- 실제 APPLIED 쿠폰 1개이면 해당 쿠폰을 종료한 뒤 신규발행.
- 같은 옵션의 APPLIED 쿠폰 2개 이상은 신규발행 차단.
- APPLIED 쿠폰 목록 API 조회 실패도 신규발행 차단.
- 현재 APPLIED 쿠폰이 없는 상태에서 신규생성 실패 시 반복대상은 유지해 다시 시도 가능.
- 기존 사전검증/자동운영/옵션ID 중복판정 회귀검증 통과.

## 3차 — 타입·배포·회귀
- V203/V205/V206/V207/V208/V208.1/V209/V210/V211/V212 웹 정적 회귀검증 통과.
- V211 대비 TypeScript 상대검사: Web 44→44, Worker 1→1, **신규 오류 시그니처 0건**.
- Ncloud V204 대비 Worker 상대검사: 4→4, **신규 오류 시그니처 0건**.
- Ncloud `UPGRADE_NCLOUD_V205.sh` `bash -n` 통과.
- Ncloud V204 기능검증 + V205 복구발행 3라운드 검증 통과.
- ZIP 패키징 전 불필요한 과거 배포문서/릴리즈노트 제거.

## 현 작업환경 제한
`npm ci`는 코드 오류가 아니라 ChatGPT 내부 npm 미러가 `zod@4.4.3` tarball에 HTTP 404를 반환하여 완료하지 못했습니다. 실제 GitHub Actions와 Ncloud 배포 스크립트는 각각 `npm ci`와 production build/typecheck를 다시 수행합니다. Ncloud V205는 설치/검증/빌드/전환 중 실패하면 기존 V204 systemd 설정으로 자동 복구합니다.
