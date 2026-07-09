# V176 RELEASE NOTES

## 버전명
`V176_GITHUB_PAGES_DEPLOY_ASSIST`

## 주요 변경
1. 간편운영 화면에 `V176 GitHub·Pages 배포 점검` 패널 추가
2. 신규 API `GET /api/system/deploy-readiness` 추가
3. GitHub 업로드, Pages 환경변수, Worker 배포, Ncloud/Tunnel, 운영 키 주입 상태를 한 화면에서 확인
4. `업체 송장 업로드` 용어 유지
5. `VITE_WORKER_URL`을 Worker 주소로 유지해야 한다는 안내 강화

## 검증
- Web production build 통과
- Worker TypeScript check 통과
- V176 service verification 통과
