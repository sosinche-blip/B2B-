# V208.1 Worker 타입오류 수정본 배포

1. 기존 GitHub 저장소를 백업합니다.
2. `B2B_OPERATION_MASTER_V208_1_WORKER_TYPE_HOTFIX.zip` 압축을 풉니다.
3. 압축을 푼 폴더 **안의 파일/폴더 전체**를 GitHub 저장소 `main`에 덮어씁니다.
4. `Actions → Deploy Cloudflare Worker`의 새 실행이 초록색 성공인지 확인합니다.
5. 성공 후 아래 주소를 엽니다.
   `https://coupang-toss-b2b-automation.sosinche.workers.dev/api/health`
6. `version`이 `v208-adminplus-multi-account-automation`인지 확인합니다.
7. 웹앱에서 Ctrl+F5 후 AdminPlus 연결 테스트를 다시 실행합니다.

Ncloud V202는 다시 배포하지 않습니다.
