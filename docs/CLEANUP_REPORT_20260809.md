# Cloudflare 저장소 3회 정리 검토 보고서

## 1차 — 구조/중복 검토
- 실제 Worker 엔트리는 `wrangler.toml`의 `apps/worker/src/worker.ts`.
- 루트 `worker.ts`는 배포에서 사용되지 않는 중복본이므로 제거.
- `apps/web/src/App_V218.tsx`, `apps/worker/src/worker_V218.ts`는 과거 핫픽스 보관본이므로 제거.
- `wrangler.toml.example`은 실제 `wrangler.toml`과 함께 둘 필요가 없어 제거.
- V194~V221의 과거 배포가이드/릴리즈노트/검증보고서는 현재 런타임과 무관하여 제거.

## 2차 — 참조/검증 체인 검토
- GitHub Actions는 `npm ci -> npm run verify:all -> wrangler deploy` 순서.
- `verify:all`에서 참조하는 현재 누적 회귀검증만 유지.
- `verify_v204_safe_swap_operation_status.mjs`는 현재 코드에서 실패하고 `verify:all`에서도 이미 제외되어 있어 폐기된 역사 검증기로 판단, 제거.
- Ncloud 전용 설치/서버/검증 스크립트는 Cloudflare 저장소에서 제거하고 Ncloud 별도 패키지로 분리.

## 3차 — 최신성/무결성 검토
- 핵심 파일(`App.tsx`, Worker, package/lock, workflow, V219/V221/V222 검증기)은 V222 기준본과 SHA256 동일함을 확인한 뒤 정리 시작.
- 모든 유지 `.mjs` 파일 `node --check` 통과.
- App/Worker는 TypeScript `transpileModule` 기준 syntax diagnostic 0.
- `npm ci` 전체 재현은 분석환경 내부 npm mirror의 `zod@4.4.3` 404 제한으로 수행하지 못함. 실제 GitHub Actions 환경에서는 npm registry 설치/검증을 최종 게이트로 사용.

## 제거 범주
1. 과거 버전 Markdown 문서/보고서
2. 미사용 중복 소스
3. Cloudflare 배포와 무관한 Ncloud 전용 스크립트
4. 현재 package scripts/verify chain에서 사용하지 않는 역사 검증기

이 정리본은 GitHub 저장소의 기존 파일을 전부 삭제한 뒤 **ZIP 내부 내용 전체를 저장소 루트에 업로드**하는 용도로 만들었습니다.
