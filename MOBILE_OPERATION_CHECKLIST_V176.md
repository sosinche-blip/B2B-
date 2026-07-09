# MOBILE OPERATION CHECKLIST V176

## 1. 배포 확인
- [ ] GitHub 업로드 완료
- [ ] Cloudflare Pages 자동 배포 성공
- [ ] `https://b2b-bpt.pages.dev/` 접속 가능
- [ ] 앱 버전 `V176_GITHUB_PAGES_DEPLOY_ASSIST` 표시

## 2. 실행경로 확인
- [ ] Pages → Worker → Tunnel/Ncloud → 쿠팡·토스 구조 유지
- [ ] `VITE_WORKER_URL`이 Worker 주소로 유지
- [ ] Ncloud outbound IP `101.79.27.234` 확인
- [ ] 임시 Tunnel이면 주소 변경 여부 확인

## 3. 모바일 운영 확인
- [ ] 주문 수집 탭 확인
- [ ] 매핑관리 탭 확인
- [ ] 발주 ZIP 다운로드 흐름 확인
- [ ] 업체 송장 업로드 버튼 유지 확인
- [ ] 송장 안전검증표 다운로드 확인
- [ ] 쿠팡+토스 업로드 버튼 차단 조건 확인

## 4. 보안 확인
- [ ] `.dev.vars`, `.env`, `apps/worker/.dev.vars` 미업로드
- [ ] 키값은 Ncloud 서버 또는 Cloudflare Secret에만 보관
- [ ] GitHub에는 예시 파일만 업로드
