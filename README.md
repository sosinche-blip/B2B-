# B2B Operation V199

쿠팡·토스 통합 주문조회, 발주·송장·쿠폰 운영, 쿠팡 인증키 교체에 매핑 전용 자동 동기화와 앱 직접 신규등록을 추가한 웹앱/Cloudflare Worker 전체본입니다.

## 배포 범위

- 배포: GitHub + Cloudflare Pages/Worker
- 변경하지 않음: Ncloud 고정 IP API 중계 서버
- 추가 Supabase SQL: 없음. 기존 `operation_persistent_settings` 테이블을 사용합니다.

배포는 `DEPLOY_V199_EASY.md`, 기능 설명은 `V199_RELEASE_NOTES.md`, 운영 방법은 `OPERATIONS_GUIDE_V199.md`를 확인하세요.
