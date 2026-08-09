# V216 기존확정 매핑/발주시간 수정 오류 보강 및 배포 가이드

## 왜 이미 매칭한 상품이 다시 `매칭 확정`으로 보였나
1. AdminPlus 상품문자열 매칭 목록이 큰 계정에서 첫 500건만 보던 경로가 있어 이후의 기존 매칭을 놓칠 수 있었습니다.
2. B2B 확정 링크가 `옵션ID + AdminPlus accountId`에 너무 엄격히 묶여 있어, 같은 업체 계정을 다시 저장해 accountId가 바뀌면 기존 확정을 신규처럼 오판할 수 있었습니다.
3. 전체 설정 저장 때 브라우저가 가진 일부 `adminplusProductLinks`로 서버의 전체 링크를 교체할 수 있어 과거 확정 링크가 빠질 수 있었습니다.

## V216 수정
- AdminPlus 매칭 목록 cursor 페이지네이션(500건씩, 최대 20페이지).
- 동일 `채널+옵션ID`의 서버 링크는 accountId가 달라도 업체명이 같으면 기존 확정으로 인식하고 현재 accountId로 메타데이터만 복구.
- B2B 링크가 빠졌더라도 AdminPlus 실제 1:1 매칭의 상품/옵션/수량이 서버 매핑과 같으면 자동으로 확정 링크를 복구.
- AdminPlus 실제 수량과 서버 기본수량이 다르면 거짓으로 자동확정하지 않고 `수량 차이 확인` 상태로 표시.
- 서버 settings 저장 시 확정 링크 목록을 기존 서버자료와 ID별 병합해 일부 링크 유실 방지.

## 발주시간 수정 오류 보강
- 발주시간/배송비는 AdminPlus 상품매칭 값이 아니라 B2B 서버 운영값입니다.
- 따라서 발주시간 또는 배송비만 수정할 때는 AdminPlus 상품매칭 API를 호출하지 않습니다.
- `수정 확정` 시 B2B 서버 저장 후 서버에서 다시 읽어 `purchaseTime/baseQty/shippingFee`가 정확히 같은지 검증한 뒤에만 성공 처리합니다.
- 상품/옵션/기본수량을 실제 변경한 경우에만 AdminPlus에 재적용하고 상품코드/옵션코드/수량을 다시 조회해 검증합니다.

## 중요한 수량 충돌 예외
같은 AdminPlus `match_string`(업체상품명)을 여러 마켓 옵션ID가 공유하면서 서로 다른 `기본수량`을 요구하는 경우에는 한 개의 AdminPlus 매칭 수량으로 동시에 표현할 수 없습니다. 이 경우 V216은 다시 상품을 찾으라고 하지 않고 실제 AdminPlus 수량과 서버 기본수량의 차이를 명확히 표시합니다. 해당 행의 수량 정책을 확인한 뒤 `수정 확정`해야 합니다.

## 배포 순서
1. `NCLOUD_FIXED_IP_GATEWAY_V207_CONFIRMED_MATCH_TIME_FIX_20260809.zip`과 `DEPLOY_NCLOUD_CONFIRMED_MATCH_TIME_FIX_V6.ps1`을 Downloads에 저장.
2. PowerShell에서 V6 실행.
3. Ncloud `/api/system/status`에서 `featureRevision = confirmed-match-time-commit-v216-20260809` 확인.
4. `B2B_OPERATION_MASTER_V216_CONFIRMED_MATCH_TIME_FIX_20260809.zip` 내부 파일/폴더를 GitHub main에 반영.
5. GitHub Actions Worker 배포 성공 및 Cloudflare Pages Production 성공 확인.
6. 웹앱 `Ctrl+F5`.

## 실제 검증
- API 상품매칭 조회: 이미 확정된 행은 다시 `매칭 확정`으로 요구하지 않아야 함.
- 기존 확정행의 발주시간을 `09:00,14:00`으로 변경 → `수정 확정` → 성공 메시지에 `서버 재조회 검증 완료` 확인.
- Ctrl+F5 또는 재접속 후에도 `09:00,14:00` 유지.
- 자동감시 화면에도 같은 확정 발주시간이 표시되어야 함.
