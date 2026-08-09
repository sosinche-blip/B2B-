# V217 웹앱 / Cloudflare Worker 배포

1. Ncloud V208 수정본을 먼저 배포합니다.
2. Ncloud `/api/system/status`에서 `featureRevision = option-baseqty-confirm-v217-20260809`를 확인합니다.
3. 현재 GitHub main을 백업합니다.
4. `B2B_OPERATION_MASTER_V217_OPTION_BASEQTY_CONFIRM_FIX_20260809.zip` 내부의 파일/폴더 전체를 기존 저장소 main에 반영합니다.
5. GitHub Actions Worker 배포 성공 확인.
6. Cloudflare Pages Production Success 확인.
7. Worker `/api/health`의 `featureRevision = option-baseqty-confirm-v217-20260809` 확인.
8. 웹앱에서 Ctrl+F5.
9. `매핑·발주 → API 상품매칭 → 엑셀매핑 자동추천` 실행.
10. 기존 단독 확정매핑은 `확정 완료` 유지, 동일 업체상품명을 여러 옵션ID가 공유하는 구버전 자료만 1회 `수정 확정`으로 옵션별 독립매칭 전환.
11. `95235689038/039/040`의 기본수량이 각각 엑셀 매핑값 5/2/1로 표시되는지 확인.
12. 발주시간을 변경하고 수정확정한 후 성공 메시지와 새로고침 후 유지 여부 확인.
