# V218 단일 AdminPlus 옵션 자동확정 오류 수정

## 화면 오류 해석
`요청 상품 10001696 / 옵션 0 / 수량 5 / 재조회 상품 10001696 / 옵션 1484 / 수량 5`는 상품/수량 저장 실패가 아니라 기존 링크의 AdminPlus optionCode가 비어 있던 레거시 상태입니다. AdminPlus가 실제 단일 옵션 1484를 반환했는데 기존 검증이 0과 1484를 비교해 실패로 오판했습니다.

## 수정
- 상품 옵션이 1개이면 실제 AdminPlus optionCode를 자동 선택·저장합니다.
- 옵션이 여러 개면 자동 선택하지 않습니다.
- Worker도 option_code 생략 요청은 resolved option을 허용하되 명시 옵션은 정확 일치를 유지합니다.
- 엑셀 optionId/baseQty는 B2B source of truth로 유지합니다.

## 배포
1. Ncloud V209 배포.
2. `/api/system/status`에서 `hotfixRevision = single-adminplus-option-v218-20260809` 확인.
3. V218 웹/Worker를 GitHub main에 반영.
4. GitHub Actions Worker 배포 성공 확인.
5. Cloudflare Pages Production 성공 확인.
6. Ctrl+F5 후 API 상품매칭 재조회.
7. 기존 10001696 상품이 단일 옵션 1484로 자동 보정되는지 확인.
8. `95235689038/039/040` 등 마켓 optionId와 Excel baseQty는 기존 값 그대로 유지되는지 확인.
