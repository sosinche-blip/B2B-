# B2B 운영 자동화 V169

쿠팡·토스 주문 수집, B2B 업체별 발주엑셀 생성, 발주폴더 기준 업체송장 회수, 쿠팡·토스 배송중 업로드, 여러 쿠폰 24시간 반복 운영, 서버 저장용량 점검·정리를 위한 모바일 대응 운영본입니다.

## 핵심 작업 흐름

1. 주문관리에서 `쿠팡 수집`, `토스 수집`, `쿠팡+토스 수합`을 눌러 주문을 수집합니다.
2. 앱이 쿠팡/토스 옵션ID 기준으로 B2B 업체·업체상품명·기본수량을 매핑하고, 발주폴더에 업체별 발주엑셀과 쿠팡/토스 상품준비중 입력파일을 저장합니다.
3. 사용자가 업체별 발주엑셀을 업체에 전달합니다.
4. 업체가 회신한 송장엑셀은 `업체송장` 버튼으로 여러 개 선택해 발주폴더에 복사합니다.
5. `쿠팡+토스 업로드`를 누르면 발주폴더의 쿠팡/토스 입력파일과 업체 송장파일을 자동 매칭해 택배사·운송장번호를 채우고, Gate와 인증이 열려 있으면 쿠팡/토스 배송중 업로드를 실행합니다.
6. 쿠폰관리는 여러 쿠폰을 체크해 `선택 쿠폰 일괄 반영` 후 서버 저장하면 23:50 직전쿠폰 취소, 23:51 신규 24시간 쿠폰 생성을 반복합니다.
7. 스케줄러는 쿠폰과 서버 용량 점검·정리만 관리합니다. 주문수집·발주·송장등록은 버튼 수동 실행입니다.

## 로컬 실행

```text
START_HERE_WINDOWS.cmd
```

권장 압축 해제 위치 예시:

```text
C:\B2B\V169
```

## 서버/모바일 운영 자료

- `DEPLOYMENT_GUIDE_V169.md`: Supabase, GitHub, Cloudflare, Ncloud 배포 순서
- `MOBILE_OPERATION_CHECKLIST_V169.md`: 모바일 운영 전 점검표
- `V169_RELEASE_NOTES.md`: 정리·삭제 내역과 5회 검토 결과

## 실제 API 반영 조건

```text
API_CONNECTION_PAUSED=false
ALLOW_LIVE_EXTERNAL_API=true
ALLOW_FINAL_EXECUTION=true
ALLOW_SCHEDULED_WRITES=true
```

쿠팡은 Open API 허용 IP가 맞지 않으면 주문조회, 쿠폰, 송장업로드가 403으로 차단됩니다. 모바일 운영에서 쿠팡 API까지 안정적으로 쓰려면 허용 IP가 고정되는 서버 구성이 필요합니다.

## V170 모바일 운영 메모

- 모바일 기본: 주문수집 → 매핑관리 → 전체 발주 → 브라우저 ZIP 다운로드
- PC 보조: START_HERE_WINDOWS.cmd 실행 후 로컬 발주폴더 저장/폴더 열기
- 매핑 엑셀은 매핑관리 → 양식 받기에서 V170 양식을 내려받아 작성하고, 매핑 업로드 후 서버 저장을 누르면 Supabase 설정으로 보관됩니다.
- Quick Tunnel은 임시 연결입니다. 실운영 전 고정 Tunnel 또는 도메인 HTTPS 연결을 권장합니다.

## V173 운영 메모
- 모바일 화면 버전은 `V175 서버 매핑저장 안정화`입니다.
- Worker 장애 또는 502가 발생해도 웹앱은 `VITE_NCLOUD_TUNNEL_URL` 또는 기본 Tunnel 주소로 대체 호출을 시도합니다.
- Worker에는 `NCLOUD_API_BASE=https://cookies-bachelor-border-damages.trycloudflare.com` 값을 두고 `/api/*`를 Ncloud 서버로 중계하는 구성을 권장합니다.


## V175 필수 운영 메모

V175는 Ncloud API 서버의 CORS 전역 응답과 서버 매핑저장 fallback을 포함합니다. GitHub/Pages만 재배포하면 부족하며, Ncloud 서버에도 V175 파일을 반영한 뒤 `npm ci` 및 `PORT=8080 HOST=0.0.0.0 npm run start:ncloud` 재시작이 필요합니다.
