# V194 Cloudflare 배포

## 1. GitHub 반영

V194 압축을 해제한 뒤 기존 저장소 파일을 전체 교체합니다. `.dev.vars`, 실제 비밀키, `node_modules`, `dist`는 업로드하지 않습니다.

```bash
npm ci
npm run verify:all
git add .
git commit -m "Deploy V194 operation control"
git push
```

## 2. Cloudflare

GitHub Actions가 성공한 뒤 다음을 확인합니다.

- Worker `/api/system/status` 버전: `v194-operation-control`
- Pages 화면 제목: `V194 운영관제·재처리·주소품질 운영본`
- 간편운영 화면의 일일 운영 점검판 표시

## 3. Ncloud

Ncloud V193는 변경하지 않습니다. V194 기능은 웹 UI와 Cloudflare Worker의 기존 Supabase 로그·설정 API를 사용하며, 쿠팡·토스 외부 API 경로는 V193 게이트웨이와 호환됩니다.

## 4. Supabase

새 SQL 마이그레이션은 없습니다. 기존 테이블을 사용합니다.

- `operation_temp_sessions`
- `operation_persistent_settings`
- `operation_audit_logs`
- 기존 쿠폰 자동화 테이블
