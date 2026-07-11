# V194 Cloudflare 배포

1. V194 압축을 해제합니다.
2. 기존 GitHub `B2B-` 저장소에 전체 소스를 덮어씁니다.
3. `.dev.vars`, `.env`, `node_modules`, `dist`, `.ncloud`는 Git에 포함하지 않습니다.
4. 아래 검증을 실행합니다.

```bash
npm ci
npm run verify:all
```

5. 검증 통과 후 커밋·푸시합니다.

```bash
git add -u
git add .
git commit -m "Deploy V194 preparing order selection"
git push origin main
```

6. GitHub Actions의 Worker 배포와 Cloudflare Pages 최신 배포가 모두 성공했는지 확인합니다.

## Ncloud 적용 범위

- V193 주소 누락 수정에는 `NCLOUD_FIXED_IP_GATEWAY_V193_20260711.zip` 적용이 필요합니다.
- V194의 상품준비중 선택수합은 Cloudflare 웹앱의 상태 선택·수합 로직 수정이므로 별도 V194 Ncloud 파일은 없습니다.
- Ncloud가 이미 V193이면 그대로 유지합니다.
