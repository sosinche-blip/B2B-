# V184 Cloudflare 배포

## 1. 사전 조건

- R2 버킷: `b2b-operation-files`
- Worker 바인딩: `B2B_FILES`
- Supabase Secret: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Ncloud 고정 IP API: `http://101.79.27.234.sslip.io:8080`

## 2. 검증

```bash
npm ci
npm run verify:all
```

## 3. 배포

GitHub `main` 브랜치에 반영하거나 아래 명령으로 Worker를 배포합니다.

```bash
npx wrangler deploy
```

웹은 기존 Cloudflare Pages 배포 절차를 사용합니다.

## 4. 확인

```text
/api/local/health
```

정상 모드:

```json
{"ok":true,"mode":"cloudflare_r2_purchase_folder_v184"}
```

Ncloud에는 V184 전체 압축파일을 배포하지 않습니다.
