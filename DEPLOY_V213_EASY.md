# V216 기존확정 복구/발주시간 확정저장 수정본 배포

## 선행 조건
Ncloud V207 동반 수정본을 먼저 배포해야 합니다.

Ncloud 확인:
```bash
curl -sS http://127.0.0.1:8080/api/system/status
```
정상 기준:
- `"ok": true`
- `"version": "v213-per-option-payment-toss-mapping"`
- `"featureRevision": "confirmed-match-time-commit-v216-20260809"`

## Cloudflare/GitHub 배포
1. 현재 GitHub 저장소를 ZIP 또는 브랜치로 백업합니다.
2. `B2B_OPERATION_MASTER_V216_CONFIRMED_MATCH_TIME_FIX_20260809.zip`을 풉니다.
3. 압축 내부의 `apps`, `scripts`, `.github`, `package.json`, `package-lock.json`, `wrangler.toml` 등 **내부 파일/폴더 전체**를 기존 저장소 main에 반영합니다.
4. GitHub Actions의 Worker 배포가 성공인지 확인합니다.
5. Cloudflare Pages Production 배포가 Success인지 확인합니다.
6. Worker `/api/health` 응답에서 아래를 확인합니다.
   - `version = v213-per-option-payment-toss-mapping`
   - `featureRevision = confirmed-match-time-commit-v216-20260809`
7. `https://b2b-bpt.pages.dev/`에서 Ctrl+F5 합니다.

## 배포 후 실제 확인
1. `매핑·발주 → API 상품매칭` 진입
2. 기존 확정 상품의 배송비 또는 수량을 바꿈
3. 실제 운영값은 아직 기존 서버 확정값임을 확인
4. `수정 확정` 클릭
5. 성공 메시지에 `서버 재조회 검증 완료` 확인
6. 새로고침 후 수정값 유지 확인
7. 발주시간을 `09:00,14:00`으로 저장하고 새로고침 후 유지 확인
8. 일일 운영 점검판에서 `자동감시 저장 실패`, `가격 변동 감지` 지표 확인
