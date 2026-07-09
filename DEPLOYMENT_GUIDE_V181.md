# DEPLOYMENT_GUIDE_V181

## 목적

V181은 Cloudflare Pages 배포가 `npm ci` 단계에서 내부 OpenAI Artifactory 주소로 패키지를 받으려다 `ETIMEDOUT`으로 실패한 문제를 수정한 버전입니다.

## 원인

`package-lock.json`의 일부 `resolved` URL이 다음 내부 주소로 잠겨 있었습니다.

```text
packages.applied-caas-gateway1.internal.api.openai.org/artifactory/api/npm/npm-public
```

Cloudflare Pages 빌드 환경에서는 이 내부 주소에 접근할 수 없으므로 `xlsx-0.18.5.tgz` 다운로드가 실패했습니다.

## 수정

- `package-lock.json`의 내부 resolved URL을 `https://registry.npmjs.org/` 기준으로 수정
- `.npmrc`의 public registry 설정 유지
- 앱 버전을 `V181_PAGES_NPM_REGISTRY_LOCK_FIX`로 변경

## Cloudflare Pages 설정

| 항목 | 값 |
|---|---|
| Build command | `npm ci && npm --workspace apps/web run build` |
| Build output directory | `apps/web/dist` |
| Root directory | 비워둠 |
| Production branch | `main` |

## 배포 순서

1. V181 ZIP 압축 해제
2. ZIP 안의 내용물을 GitHub 저장소 루트에 덮어쓰기
3. `.dev.vars`, `.env`, `node_modules`, `dist`, `.wrangler` 업로드 금지
4. GitHub main에 commit/push
5. Cloudflare Pages Deployments에서 최신 배포가 Success인지 확인
6. `https://b2b-bpt.pages.dev/` 첫 화면에서 V181 표시 확인
