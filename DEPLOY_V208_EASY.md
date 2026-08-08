# 웹앱 V208 쉬운 배포
1. 기존 GitHub 저장소를 ZIP으로 백업합니다.
2. `B2B_OPERATION_MASTER_V208_ADMINPLUS_AUTOMATION.zip` 압축을 풉니다.
3. 바깥 폴더가 아니라 **안의 파일/폴더 전체**를 연결된 GitHub 저장소 `main`에 업로드합니다.
4. GitHub Actions `Deploy Cloudflare Worker`가 초록색 성공인지 확인합니다.
5. Cloudflare Pages 최신 Production 배포가 Success인지 확인합니다.
6. `https://b2b-bpt.pages.dev/`에서 `Ctrl+F5` 합니다.
7. 설정 → Ncloud 보안 인증관리에서 공통 관리 토큰을 입력합니다.
8. 설정 → 어드민플러스 셀러 API 다계정 관리에서 협력사 계정을 한 개씩 등록하고 `전체 연결·만료 확인`을 실행합니다.
9. 자동화 → 어드민플러스 설정시간별 발주·운송장 자동화에서 시간을 설정하고 `발주 사전검증`을 먼저 실행합니다.
10. 검증 결과가 정상일 때 자동화를 `사용`으로 바꾸고 `자동화 설정 서버 저장`을 누릅니다.

주의: AdminPlus 주문 등록과 결제 접수는 공식 API상 별도 단계입니다. V208은 안전을 위해 **주문 등록까지만 자동화**하고 예치금/적립금/무통장 결제 접수는 자동 실행하지 않습니다.
