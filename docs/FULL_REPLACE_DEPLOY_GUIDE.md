# GitHub/Cloudflare 전체 교체 배포 가이드

## 권장 방법
기존 GitHub 저장소를 먼저 ZIP으로 백업하거나 새 backup branch/tag를 만듭니다.

그 다음 기존 `main`의 파일을 정리하고 이 패키지의 **내용물**을 저장소 루트에 넣습니다. ZIP 상위 폴더 자체를 한 단계 더 넣지 마세요.

저장소 루트에는 최소 다음이 보여야 합니다.
- `.github/`
- `apps/`
- `scripts/`
- `supabase/`
- `docs/`
- `.dev.vars.example`
- `.gitignore`
- `.npmrc`
- `package.json`
- `package-lock.json`
- `wrangler.toml`
- `README.md`

커밋 후 GitHub Actions `Deploy Cloudflare Worker`가 Success인지 확인합니다.
그 다음 Cloudflare Pages Production 최신 배포가 Success인지 확인하고 웹앱에서 `Ctrl+F5` 합니다.

## 절대 업로드하지 말 것
- `.dev.vars`
- `.env*` 실제 비밀값
- `node_modules/`
- `dist/`, `apps/web/dist/`
- Ncloud의 `/root/...` 보안파일
