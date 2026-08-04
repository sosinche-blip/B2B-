# V199 쉬운 배포

1. GitHub 저장소의 현재 main 브랜치를 ZIP으로 백업합니다.
2. `B2B_OPERATION_MASTER_V199_MAPPING_SYNC_EXCEL_COMPAT_20260804` 폴더 안의 파일 전체를 저장소 루트에 업로드합니다.
3. main 브랜치에 커밋합니다.
4. GitHub Actions의 `Deploy Cloudflare Worker`가 초록색 성공인지 확인합니다.
5. Cloudflare Pages 최신 배포가 Success인지 확인합니다.
6. 웹앱에서 Ctrl+F5를 누릅니다.
7. `매핑·발주 → 상품 매핑`에서 상태가 `서버 최신 매핑 ...` 또는 `기존 설정 API 호환모드`로 표시되는지 확인합니다.

Worker 배포가 실패해도 V199 웹앱은 기존 `/api/operation/settings/*` API로 자동 전환합니다. Ncloud 서버에는 아무 파일도 올리지 않습니다.
