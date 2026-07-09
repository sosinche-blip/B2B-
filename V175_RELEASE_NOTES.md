# V175_RELEASE_NOTES

## 1. 버전명

`V175_ATTACHMENT_REBASE_DEPLOY_READY`

## 2. 목적

첨부된 V169 ZIP을 기준점으로 다시 시작하면서, V170~V174에서 정리한 모바일 운영 방향을 배포 가능한 형태로 재정리했습니다.

## 3. 주요 변경

1. 앱/Worker/package 버전을 `0.1.0-v175`로 정리했습니다.
2. 앱 표시 버전을 `V175_ATTACHMENT_REBASE_DEPLOY_READY`로 변경했습니다.
3. 실행경로 점검 API와 환경변수 진단 기능을 유지했습니다.
4. `업체 송장 업로드` 명칭을 유지했습니다.
5. GitHub 업로드 전 민감파일 확인 스크립트 `verify:git-safe`를 추가했습니다.
6. Windows 사용자를 위한 `GITHUB_UPLOAD_GUIDE_V175.md`와 `GITHUB_UPLOAD_V175_WINDOWS.cmd`를 추가했습니다.

## 4. 운영 주의

- GitHub에 `.dev.vars`, `.env`, `.env.local`, `apps/worker/.dev.vars`를 올리면 안 됩니다.
- `VITE_WORKER_URL`은 `https://coupang-toss-b2b-automation.sosinche.workers.dev`를 유지합니다.
- Pages에서 `http://101.79.27.234:8080`을 직접 호출하도록 바꾸지 않습니다.
- 현재 임시 `trycloudflare.com` Tunnel은 실운영 전에 고정 Tunnel 또는 도메인 기반 HTTPS API로 전환해야 합니다.
