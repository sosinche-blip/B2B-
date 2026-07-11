# V192 배포

## Cloudflare 앱

1. V192 압축을 해제합니다.
2. 기존 Git 저장소에 소스를 덮어씁니다. `.git`, `.env`, `.dev.vars`, `node_modules`, `dist`는 덮어쓰지 않습니다.
3. `npm ci` 후 `npm run verify:all`을 실행합니다.
4. 검증 성공 후 커밋하고 `main`에 push합니다.
5. GitHub Actions의 Worker 배포가 초록색 Success인지 확인합니다.
6. Cloudflare Pages 최신 배포를 확인하고 앱을 강력 새로고침합니다.

## Ncloud 게이트웨이

Cloudflare 전체본에는 Ncloud 실행코드가 포함되지 않습니다. 서버 정리본은 별도 `NCLOUD_FIXED_IP_GATEWAY_V192_20260711.zip`을 사용합니다. 기존 V187도 기능상 호환되지만, 과거 설명·환경변수 예시를 정리하려면 V192 게이트웨이를 1회 적용합니다.
