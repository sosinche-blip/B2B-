# V175_ATTACHMENT_REBASE_DEPLOY_READY 개발 요약

## 1. 기준점

사용자가 새로 첨부한 `DEPLOYMENT_GUIDE_V169(2).zip`을 기준 자료로 다시 잡고, 새 채팅 전까지 진행했던 모바일 운영 방향을 반영한 배포 준비본입니다.

## 2. 유지한 운영 구조

- 모바일 Pages: `https://b2b-bpt.pages.dev`
- Pages 환경변수: `VITE_WORKER_URL=https://coupang-toss-b2b-automation.sosinche.workers.dev`
- Worker 역할: HTTPS 중계 프록시
- Ncloud API 서버: `101.79.27.234`, 내부 API `http://127.0.0.1:8080`
- 쿠팡·토스 실제 호출 outbound IP 기준: `101.79.27.234`

## 3. 반영 방향

1. PC 로컬 폴더 중심 기능은 보조 기능으로 유지합니다.
2. 모바일 기본 흐름은 주문수집, 매핑관리, 발주 ZIP 다운로드, 업체 송장 업로드, 송장 안전검증, 쿠팡·토스 업로드입니다.
3. `업체 송장 업로드` 용어는 그대로 유지합니다.
4. 실행경로 점검, 환경변수 진단, 임시 Tunnel 경고를 포함합니다.
5. GitHub 업로드 전 검증과 민감파일 점검을 쉽게 할 수 있도록 `verify:git-safe`를 추가합니다.

## 4. 검증 결과

- `npm run verify:all` 기준 검증 통과 대상입니다.
- GitHub 업로드 전에는 `npm.cmd run verify:all`과 `npm.cmd run verify:git-safe`를 실행합니다.
