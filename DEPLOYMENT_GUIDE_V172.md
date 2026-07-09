# V172 배포 안내서

## 1. 버전
`V172_MOBILE_SHIPMENT_SAFETY_LOCK`

## 2. 배포 전 확인

### 2.1 현재 연결 기준
- 쿠팡 API: HTTP 200 확인 상태 기준
- 토스 API: HTTP 200 확인 상태 기준
- Ncloud 호출 IP: 101.79.27.234
- 모바일 Pages 주소: https://b2b-bpt.pages.dev
- Worker 주소: https://coupang-toss-b2b-automation.sosinche.workers.dev

### 2.2 필수 검증 명령
```bash
npm ci
npm run verify:all
```

검증 결과가 모두 PASS인 경우에만 배포합니다.

## 3. Cloudflare Pages 배포

### 3.1 Pages 설정
- Framework preset: None 또는 Vite
- Build command: `npm ci && npm --workspace apps/web run build`
- Output directory: `apps/web/dist`

### 3.2 환경변수
- `VITE_WORKER_URL` 또는 `VITE_API_BASE_URL`에 Worker 주소 설정

## 4. Worker 배포

```bash
npx wrangler deploy --config wrangler.toml
```

배포 전 Worker Secret과 `.dev.vars`의 운영 Gate 값을 확인합니다.

## 5. V172 운영 확인

### 5.1 화면 확인
- 간편운영 화면에서 `V172 모바일 단계 잠금판` 표시 확인
- `V172 송장 업로드 안전검증` 표시 확인
- 차단, 주의, 등록준비, 업로드잠금 지표 확인

### 5.2 송장 업로드 확인
- 업체송장 엑셀 업로드
- 송장 안전검증표 다운로드
- 차단 0건인 경우에만 쿠팡+토스 업로드 실행
- 차단 발생 시 API 업로드가 실행되지 않는지 확인

## 6. 운영 순서
1. 쿠팡/토스 주문 수집
2. 옵션ID 기준 자동 매핑
3. B2B 업체별 발주 엑셀 생성
4. 사용자가 업체에 발주 엑셀 업로드
5. 업체별 송장 엑셀 업로드
6. 주문번호 → 성명+주소 앞 2단어 → 성명 → 상품명 2글자 이상 일치 순 송장 매칭
7. V172 송장 안전검증 후 쿠팡·토스 송장 업로드
8. 쿠팡 즉시할인쿠폰 23:50 일괄 취소, 23:51 일괄 적용
9. 스케줄러와 서버 저장용량 자동 정리
