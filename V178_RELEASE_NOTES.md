# V178 Worker 고정IP 강제 게이트웨이

## 핵심 수정

- Worker가 `env.NCLOUD_API_BASE`를 읽지 않고 `http://101.79.27.234:8080`만 사용하도록 강제했습니다.
- Cloudflare Dashboard에 남아 있는 오래된 trycloudflare 주소 또는 잘못된 DNS 값이 Worker를 1016/530으로 떨어뜨리는 문제를 차단했습니다.
- `/api/*` 요청은 Worker -> Ncloud fixed IP API로만 프록시됩니다.

## 확인 방법

1. Worker 배포 후 `https://coupang-toss-b2b-automation.sosinche.workers.dev/` 접속
2. `mode`가 `cloudflare_worker_to_ncloud_hard_fixed_ip_proxy_v178`인지 확인
3. `ncloudApiBase`가 `http://101.79.27.234:8080`인지 확인
4. `/api/system/public-ip`에서 JSON 응답과 `outboundIp=101.79.27.234` 확인
