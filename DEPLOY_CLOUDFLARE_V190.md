# V190 Cloudflare 배포

V190은 GitHub, Cloudflare Pages·Worker에 배포합니다. 기존 Ncloud V187 최소 고정 IP 게이트웨이는 재설치하지 않습니다.

1. V190 소스를 기존 Git 저장소에 복사합니다.
2. `npm ci` 후 `npm run verify:all`을 실행합니다.
3. 검증 통과 후 커밋·푸시합니다.
4. GitHub Actions의 `Deploy Worker`가 성공하는지 확인합니다.
5. Cloudflare Pages 최신 배포가 성공했는지 확인합니다.
6. 앱에서 강력 새로고침 후 V190 제목과 기능을 확인합니다.
