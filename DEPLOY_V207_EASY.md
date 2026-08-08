# 웹앱 V207 쉬운 배포

1. `B2B_OPERATION_MASTER_V207_OPTIONID_DUPLICATE_NAME_EDIT.zip`을 다운로드하고 압축을 풉니다.
2. 압축을 푼 폴더 안의 파일 전체를 기존 GitHub 저장소 `main` 브랜치에 업로드합니다.
3. GitHub Actions가 성공했는지 확인합니다.
4. Cloudflare Pages/Worker 최신 배포가 Success인지 확인합니다.
5. 웹앱에서 `Ctrl + F5`를 누릅니다.
6. 쿠폰관리 → 24시간 반복대상 관리에서 쿠폰명 입력칸이 보이는지 확인합니다.
7. `전체 사전검증`을 실행합니다. 같은 쿠폰명이라도 옵션ID가 다르면 실패하지 않아야 합니다.
8. 쿠폰명을 수정한 경우 `다음 발행부터`를 눌러 저장합니다. 현재 발행된 쿠폰명은 바뀌지 않고 다음 신규 발행부터 적용됩니다.

Ncloud는 V201을 먼저 배포해 상태 API 버전이 `v207-optionid-duplicate-coupon-name-edit`인지 확인하는 것을 권장합니다.
