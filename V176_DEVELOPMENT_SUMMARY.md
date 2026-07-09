# V176 DEVELOPMENT SUMMARY

## 1. 개발 목적
V175까지 정리한 모바일 운영 앱을 GitHub에 업로드하고 Cloudflare Pages 주소에서 바로 확인할 수 있도록, 배포 전후 점검 항목을 앱 안에서 확인하는 기능을 추가했습니다.

## 2. 핵심 반영
- `APP_VERSION`을 `V176_GITHUB_PAGES_DEPLOY_ASSIST`로 변경
- 간편운영 화면에 GitHub/Pages 배포 점검판 추가
- Worker에 `/api/system/deploy-readiness` 추가
- Pages 환경변수, Worker 배포, Ncloud outbound IP, Tunnel, 키 주입 여부를 분리 표시
- 민감파일 업로드 금지 기준 유지

## 3. 유지 사항
- 모바일 기본 흐름은 주문 수집 → 매핑 → 발주 ZIP → 업체 송장 업로드 → 송장 매칭 → 쿠팡·토스 업로드 순서 유지
- PC 로컬 폴더 기능은 보조 기능 유지
- `업체 송장 업로드` 용어 유지
