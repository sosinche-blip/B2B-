# B2B 쿠팡·토스 모바일 운영 자동화 앱 V177 배포 안내

## 버전명

V177_MAPPING_UPLOAD_AND_API_502_GUARD

## 목적

V177은 사용자가 첨부한 매핑 엑셀 양식 형태를 표준으로 반영하고, 모바일 화면에서 발생한 HTTP 502 진단 오류를 쿠팡·토스 API 오류와 Worker/Tunnel/Ncloud 경로 오류로 분리하기 위한 버전입니다.

## 매핑 표준 양식

매핑 엑셀 표준 열은 다음 7개입니다.

| 채널 | 옵션ID | 업체명 | 코드번호 | 업체상품명 | 원가 | 기본수량 |
|---|---|---|---|---|---:|---:|
| 쿠팡 | 95185230666 | 늘푸른 |  | 하프절단 암꽃게 1kg (6-10조각) | 14200 | 1 |

지원 파일은 `.xlsx`, `.xls`, `.csv`입니다. V177은 CDN 엑셀 라이브러리 호출이 실패해도 단순 xlsx 구조를 앱 자체에서 읽는 보조 파서를 포함합니다.

## HTTP 502 판단 기준

화면에서 다음 오류가 보이면 우선순위를 다르게 봅니다.

```text
API 응답 JSON 파싱 실패: HTTP 502
```

이 경우 쿠팡·토스 키 또는 허용 IP 문제로 단정하지 말고 먼저 다음을 확인합니다.

1. Cloudflare Worker가 최신 V177로 배포되었는지
2. Worker의 `NCLOUD_API_BASE`가 현재 살아 있는 Tunnel/도메인인지
3. Ncloud에서 `http://127.0.0.1:8080/api/system/status`가 정상인지
4. cloudflared Quick Tunnel 주소가 바뀌지 않았는지
5. 실제 outbound IP가 `101.79.27.234`인지

## 운영 주소

Pages 환경변수는 계속 아래 값을 유지합니다.

```text
VITE_WORKER_URL=https://coupang-toss-b2b-automation.sosinche.workers.dev
```

`VITE_WORKER_URL=http://101.79.27.234:8080` 직접 연결은 사용하지 않습니다.

## 배포 후 확인

1. `https://b2b-bpt.pages.dev/` 접속
2. 화면 버전 `V177_MAPPING_UPLOAD_AND_API_502_GUARD` 확인
3. 매핑관리에서 V177 매핑양식 다운로드
4. 첨부 양식과 같은 7개 열 파일 업로드
5. 운영설정 또는 간편운영에서 API 502 점검 실행
6. 쿠팡진단/토스진단/IP확인 재실행
