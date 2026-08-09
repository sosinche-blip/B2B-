# V217 API 매핑 확정 오류 수정 가이드

## 500건 설명 정정
이전에 설명한 `처음 500건`은 **사용자가 B2B에서 매핑한 개수**가 아니라 AdminPlus `product_matches` API 한 페이지의 조회 단위였습니다. 현재 B2B 매핑이 50건 미만이라면 그 숫자 자체가 이번 `Error: success`의 원인은 아닙니다. 페이지네이션 보강은 예방조치였고, 이번 화면 오류의 직접 원인은 저장 직후 재조회와 동일 업체상품명/서로 다른 기본수량의 충돌입니다.

## 이번 직접 원인
- AdminPlus POST가 success를 반환한 뒤 바로 GET하면 잠깐 이전 값이 보이는 경우, 검증 실패 메시지가 `success`가 되어 `추천 매핑 확정 실패: Error: success`로 표시됨.
- `활 바지락 1kg` 한 업체상품명을 옵션ID 95235689038/039/040이 공유하면서 기본수량 5/2/1을 요구함. 기존 AdminPlus 전역 match_string 하나에는 qty 하나만 있으므로 서로 덮어쓸 수 있음.
- 과거 저장 실패 상태가 채널별로 남아 성공 뒤에도 운영점검판 경고가 유지될 수 있었음.

## V217 방식
- API 매핑의 optionId/baseQty source of truth는 엑셀 매핑자료.
- 내부 AdminPlus 매칭은 `B2B:CP:<optionId>` 또는 `B2B:TS:<optionId>`로 옵션별 독립.
- 기존 단독 매칭은 다시 확정하지 않음.
- 동일 업체상품명을 여러 옵션이 공유할 경우, 현재 AdminPlus 실제 qty와 Excel baseQty가 이미 같은 한 행은 그대로 두고 충돌 행만 1회 독립 매칭으로 전환.
- 저장 후 최대 4회 재조회하여 반영을 확인.
- 실패하면 `success` 대신 요청값과 재조회값 차이를 표시.

## 배포 순서
1. `NCLOUD_FIXED_IP_GATEWAY_V208_OPTION_BASEQTY_CONFIRM_FIX_20260809.zip`과 `DEPLOY_NCLOUD_OPTION_BASEQTY_CONFIRM_FIX_V8.ps1` 배포.
2. Ncloud `/api/system/status`에서 `featureRevision = option-baseqty-confirm-v217-20260809` 확인.
3. `B2B_OPERATION_MASTER_V217_OPTION_BASEQTY_CONFIRM_FIX_20260809.zip` 내부 파일을 GitHub main에 반영.
4. GitHub Actions Worker와 Cloudflare Pages Production 성공 확인.
5. 웹앱 Ctrl+F5.
6. API 상품매칭에서 엑셀매핑 자동추천 실행.
7. 95235689038/039/040의 기본수량이 각각 5/2/1인지 확인.
8. 필요한 충돌 행만 `수정 확정/매칭 확정` 1회 실행.
9. 발주시간 수정 후 확정 → 새로고침 후 유지 확인.
