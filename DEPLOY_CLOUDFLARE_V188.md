# V188 Cloudflare 배포

## 배포 대상

- GitHub: 전체 소스
- Cloudflare Worker: GitHub Actions 자동배포
- Cloudflare Pages: GitHub 연결 자동배포
- Supabase: 기존 V187 쿠폰 자동화 마이그레이션 유지
- Ncloud: 기존 V187 최소 고정 IP 게이트웨이 유지

## 배포 확인

1. GitHub Actions에서 Verify와 Deploy Worker가 모두 초록색인지 확인합니다.
2. Cloudflare Pages의 최신 Deployment가 Success인지 확인합니다.
3. 앱 제목이 `V188 API 현황·선택주문·모바일 바로가기 운영본`인지 확인합니다.
4. 앱 시작 시 API 현황 4개가 한 줄로 표시되는지 확인합니다.
