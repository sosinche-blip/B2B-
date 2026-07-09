# V170_MOBILE_MAPPING_OPERATION 변경 내역

## 핵심 반영

1. 모바일 중심 운영 흐름을 9단계로 재정리했습니다.
1.1 PC 로컬폴더 저장/열기는 보조 기능으로 낮추고, 기본 발주는 업체별 엑셀 ZIP 다운로드 방식으로 전환했습니다.
1.2 매핑 엑셀 업로드와 함께 미매핑 주문을 카드형으로 바로 수정·저장할 수 있도록 보강했습니다.
1.3 송장 매칭 기준을 주문번호 → 성명+주소 앞 2단어 → 성명 → 상품명 2글자 이상 순서로 명시하고, 상품명 2글자 이상 보조 매칭을 추가했습니다.
1.4 업체 송장 엑셀 업로드 후 쿠팡·토스 송장 등록 파일 생성 및 API 업로드 흐름을 유지했습니다.
1.5 쿠팡 즉시할인쿠폰 23:50 취소, 23:51 적용, 서버 저장용량 정리 스케줄러 흐름을 유지했습니다.

## 현재 연결 기준

- 쿠팡 API: HTTP 200 확인 상태 기준으로 이어 개발
- 토스 API: HTTP 200 확인 상태 기준으로 이어 개발
- Ncloud 호출 IP: 101.79.27.234
- 모바일 Pages: https://b2b-bpt.pages.dev
- Worker: https://coupang-toss-b2b-automation.sosinche.workers.dev

---

# V170 정리 내역

## 삭제·정리

- 죽은 쿠팡 상품/옵션 동기화 UI·API 경로 정리
- `COUPANG_PRODUCTS_PATH` 환경변수 제거
- 직접 입력용 `COUPANG_COUPON_ID`, `COUPANG_COUPON_CONTRACT_ID` 예시 제거
- 발주폴더 통합 이후 남아 있던 업로드폴더 기본값을 발주폴더 alias로 정리
- README와 실행 스크립트의 구버전 표기 정리
- 서버 배포/모바일 운영 가이드 추가

## 유지

- 주문관리, 매핑관리, 양식설정, 발주관리, 쿠폰관리, 스케줄러, 운영설정
- 쿠폰 실행 전 원가·판매가 기반 최소 안전검증
- 발주폴더 기준 업체송장 자동매칭
- 쿠팡/토스 배송중 업로드
- 여러 쿠폰 24시간 반복 운영

## 5회 검토 결과

1. 메뉴 구조 검토: 순이익 메뉴 제거 상태 유지, 주요 운영 메뉴 영향 없음
2. API 구조 검토: 주문·송장·쿠폰 핵심 API 유지, 죽은 쿠팡 상품옵션 API 제거
3. 환경변수 검토: 실제 비밀키는 secret 또는 .dev.vars만 사용하도록 정리
4. 모바일 운영 검토: 발주폴더 통합 흐름과 모바일 파일목록/다운로드 흐름 유지
5. 배포 검토: Supabase, GitHub, Cloudflare, Ncloud 역할을 분리해 안내 문서 추가


## V170.1 Pages API 연결 보정
- Pages 배포 화면에서 상대경로 `/api/...`를 호출해 HTML 404가 JSON으로 파싱되던 문제를 방지했습니다.
- 웹앱은 `VITE_WORKER_URL` 또는 `VITE_API_BASE_URL` 환경변수를 기준으로 Worker API를 호출합니다.
- API 응답이 HTML/빈 본문일 때 원인 URL과 HTTP 상태가 보이도록 오류 메시지를 보강했습니다.

## V170.2 Ncloud Fixed Public IP Server Mode

- Ncloud Server에서 같은 Worker API 라우트를 실행할 수 있는 Node 서버 어댑터를 추가했습니다.
- `npm run start:ncloud` 명령으로 Ncloud Public IP를 쿠팡/토스 API 호출 출구 IP로 사용할 수 있습니다.
- Cloudflare Pages 환경변수 `VITE_WORKER_URL`을 Ncloud API 서버 주소로 바꾸면 모바일 화면이 Ncloud API를 호출합니다.
- 실제 비밀키는 `.dev.vars` 또는 서버 환경변수로만 주입하며 GitHub에 커밋하지 않습니다.


## V170.3 mobile cloud download fallback
- Cloud/모바일 환경에서 PC 로컬 폴더 저장 helper에 접근하지 못할 때 발주 산출물을 브라우저 ZIP 다운로드로 자동 전환합니다.
- 발주 폴더 ZIP 버튼의 실패 안내를 PC 로컬폴더용 기능임을 명확히 표시하도록 보강했습니다.
