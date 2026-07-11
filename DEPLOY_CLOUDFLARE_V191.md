# V191 Cloudflare 배포

V191은 GitHub, Cloudflare Pages·Worker에 배포합니다. Ncloud V187 최소 고정 IP 게이트웨이는 재설치하지 않습니다.

1. V191 소스를 기존 Git 저장소에 복사합니다.
2. `npm ci`를 실행합니다.
3. `npm run verify:all`을 실행합니다.
4. 변경사항을 커밋하고 `main` 브랜치에 push합니다.
5. GitHub Actions의 Worker 배포 성공을 확인합니다.
6. Cloudflare Pages 최신 배포 성공을 확인합니다.
7. 앱을 강력 새로고침한 뒤 V191 제목과 기능을 확인합니다.
