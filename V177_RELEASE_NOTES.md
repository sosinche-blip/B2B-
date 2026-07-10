# V177 Worker 고정IP 게이트웨이 안정화

## 핵심 변경

- 임시 `trycloudflare.com` Tunnel 주소 의존 제거
- Cloudflare Worker 기본 프록시 원본을 `http://101.79.27.234:8080`로 변경
- Pages 웹앱 API 호출 우선순위를 Worker 우선으로 변경
- Worker 530 / Cloudflare 1016 반복 원인을 줄이기 위해 `NCLOUD_API_BASE` 기본값을 Ncloud 고정 IP로 설정
- V176 주문관리 단순화 및 수집 초기화 기능 유지
- V175 Supabase 매핑 서버 저장 안정화 기능 유지

## 배포 필요

- GitHub push 후 Cloudflare Pages 재배포
- Cloudflare Worker 재배포 필수
- Ncloud 서버는 V175/Node.js 22 상태가 정상이라면 재설치 불필요
