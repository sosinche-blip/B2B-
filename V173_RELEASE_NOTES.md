# V173 모바일 직접터널·매핑 안정화 릴리즈 노트

## 목적
Cloudflare Worker 경유에서 반복된 502/1003 오류를 피하기 위해 모바일 Pages 앱의 기본 API 경로를 살아 있는 Ncloud Cloudflare Tunnel HTTPS 주소로 우선 고정했습니다. Worker는 보조 경로로만 사용합니다.

## 핵심 변경
- 화면 버전명을 `V173 모바일 직접터널·매핑 안정화`로 변경
- API 호출 우선순위 변경: `VITE_NCLOUD_TUNNEL_URL` → `VITE_API_BASE_URL` → 기본 Tunnel → `VITE_WORKER_URL` → 기본 Worker
- Worker/Tunnel 모두 실패할 때 오류 메시지에 cloudflared 및 Pages 환경변수 확인 문구 표시
- 매핑 양식 다운로드 파일명을 V173으로 변경

## 운영 환경변수 권장값
Cloudflare Pages Production 환경변수:

```txt
VITE_NCLOUD_TUNNEL_URL=https://cookies-bachelor-border-damages.trycloudflare.com
VITE_WORKER_URL=https://coupang-toss-b2b-automation.sosinche.workers.dev
```

## 검증
- Web production build
- Worker TypeScript check
- V172/V173 service verification script 호환
