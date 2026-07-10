# V172 모바일 게이트웨이·매핑 안정화

## 핵심 수정
- 화면 상단 버전을 `V172 모바일 게이트웨이·매핑 안정화`로 갱신했습니다.
- Pages 웹앱이 Worker 502/Cloudflare 1003/JSON 파싱 실패를 받으면 `VITE_NCLOUD_TUNNEL_URL` 또는 기본 Tunnel 주소로 자동 대체 호출합니다.
- Worker 코드에 `NCLOUD_API_BASE` 프록시 모드를 추가했습니다. Worker 환경변수에 Tunnel 주소가 있으면 `/api/*` 요청을 Ncloud 고정 IP 서버로 중계합니다.
- IP 확인 문구를 `등록필요` 고정 안내에서 `확인` 중심 문구로 정리했습니다.
- 매핑 업로드 보호 로직은 유지하고, 모바일 발주 흐름은 브라우저 다운로드/Supabase 저장 우선으로 유지합니다.

## 적용 후 확인
1. Cloudflare Worker `NCLOUD_API_BASE` 값이 `https://cookies-bachelor-border-damages.trycloudflare.com`인지 확인합니다.
2. Pages 환경변수에 `VITE_NCLOUD_TUNNEL_URL`을 추가하면 Worker 장애 시 직접 Tunnel 대체 호출이 가능합니다.
3. `/api/system/public-ip` 결과가 `101.79.27.234`인지 확인합니다.
