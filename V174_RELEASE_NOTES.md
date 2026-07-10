# V174 Ncloud CORS·직접터널 안정화

## 핵심 수정
- Ncloud Node API 서버에 CORS 응답 헤더를 전역 적용했습니다.
- 모바일 Pages가 `https://...trycloudflare.com` Tunnel 주소를 직접 호출해도 브라우저 CORS 차단으로 `Failed to fetch`가 발생하지 않도록 수정했습니다.
- Ncloud 서버 모드에서는 `NCLOUD_API_BASE`가 있어도 Worker 프록시 로직을 타지 않도록 `NCLOUD_SERVER_MODE=true`를 서버 내부에서 강제 적용했습니다.
- Cloudflare Worker는 보조 프록시로 유지하되, 앱 기본 연결은 Ncloud Tunnel을 우선 사용합니다.
- 화면 버전을 `V174 Ncloud CORS·직접터널 안정화`로 변경했습니다.

## 적용 후 서버 재시작 필수
Ncloud 서버에 적용한 뒤 반드시 아래 명령으로 API 서버를 재시작해야 합니다.

```bash
cd /root/b2b_ncloud
pkill -f start_ncloud_api.mjs || true
pkill -f api-server.mjs || true
PORT=8080 HOST=0.0.0.0 nohup npm run start:ncloud > ncloud-api.log 2>&1 &
tail -n 50 ncloud-api.log
```

정상 로그:

```txt
[NCLOUD] API server listening on http://0.0.0.0:8080
[NCLOUD] CORS enabled for browser/Tunnel operation (V174)
```
