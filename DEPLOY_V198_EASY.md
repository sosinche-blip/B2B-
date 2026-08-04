# 웹앱 V198 쉬운 배포

이번 배포는 GitHub/Cloudflare만 변경합니다. Ncloud 서버에는 파일을 올리지 않습니다.

1. 현재 GitHub 저장소를 `Code → Download ZIP`으로 백업합니다.
2. `B2B_OPERATION_MASTER_V198_MAPPING_SYNC_DIRECT_ENTRY_20260804` 폴더 안의 파일과 폴더 전체를 GitHub `main` 브랜치에 업로드합니다.
3. 커밋 메시지는 `Deploy V198 mapping auto sync and direct entry`로 입력합니다.
4. GitHub Actions가 초록색 성공인지 확인합니다.
5. Cloudflare `Workers & Pages → b2b-bpt → Deployments`에서 최신 배포가 Success인지 확인합니다.
6. `https://b2b-bpt.pages.dev/`을 열고 `Ctrl+F5`를 누릅니다.
7. 상단 버전이 `V198 매핑 자동동기화·앱 직접등록 운영본`인지 확인합니다.
8. `매핑·발주 → 상품 매핑`에서 `서버 최신 매핑`을 눌러 기존 자료가 보이는지 확인합니다.
9. 테스트 매핑 1건을 앱에서 직접 등록하고 `서버 자동 저장 완료` 문구를 확인합니다.
10. 모바일에서 앱을 새로 열어 같은 매핑이 표시되는지 확인합니다.

## 문제 발생 시

GitHub에서 배포 직전 커밋으로 되돌리면 이전 웹앱으로 복구됩니다. 이번 버전은 Ncloud 서비스를 변경하지 않으므로 Ncloud 복구 작업은 필요하지 않습니다.
