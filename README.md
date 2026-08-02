# B2B Operation V194

V194는 V193 주소 무결성 복구본을 기반으로 운영 안정 기능 3가지를 추가한 Cloudflare 전체본입니다.

1. 일일 운영 점검판과 마감보고서 다운로드
2. 주문조회·주문수집·발주·송장 실패 재처리 센터
3. 상세주소 누락·괄호 불일치·짧은 주소 등을 검사하는 주소 품질검사

## 배포 범위

- GitHub 소스 전체 교체
- Cloudflare Worker 재배포
- Cloudflare Pages 재배포
- Ncloud V193 고정 IP 게이트웨이는 그대로 유지
- 새 Supabase SQL 없음

## 검증

```bash
npm ci
npm run verify:all
```

자세한 내용은 `V194_RELEASE_NOTES.md`, `OPERATIONS_GUIDE_V194.md`, `V194_REVIEW_REPORT.md`, `DEPLOY_CLOUDFLARE_V194.md`를 확인하세요.
