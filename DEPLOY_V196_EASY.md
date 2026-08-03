# V196 쉬운 배포 순서

## 1. Ncloud V195를 먼저 배포

별도 ZIP `NCLOUD_FIXED_IP_GATEWAY_V195_CREDENTIALS_SECURE.zip`을 먼저 배포합니다. Ncloud 상태 API에서 다음 버전이 확인되어야 합니다.

```bash
curl -sS http://127.0.0.1:8080/api/system/status
echo
```

```text
v196-simplified-credential-management
```

관리 토큰은 Ncloud에서 다음 명령으로 확인합니다.

```bash
cat /root/B2B_CREDENTIAL_ADMIN_TOKEN.txt
```

토큰은 다른 사람에게 보내거나 화면 캡처에 포함하지 마세요.

## 2. 웹앱 V196 배포

기존 GitHub 저장소를 백업한 뒤 이 ZIP의 바깥 폴더가 아니라 **폴더 안의 파일과 폴더 전체**를 저장소 루트에 덮어씁니다.

```bash
npm ci
npm run verify:all
```

GitHub `main` 브랜치에 커밋·푸시하고 GitHub Actions와 Cloudflare Pages 배포가 성공했는지 확인합니다.

## 3. 화면 확인

웹앱에서 `Ctrl + F5`를 누릅니다.

상단 메뉴가 다음 5개이면 V196입니다.

```text
오늘운영 / 매핑·발주 / 쿠폰 / 자동화 / 설정
```

## 4. Secret Key 재발급 시 사용법

1. 쿠팡 Wing에서 새 Secret Key 확인
2. 웹앱 `설정` 열기
3. Ncloud 관리 토큰 입력
4. 새 Secret Key와 확인값 입력
5. `연결 테스트`
6. HTTP 200 성공 확인
7. `저장하고 즉시 적용`

Access Key와 Vendor ID가 바뀌지 않았다면 고급 입력칸은 비워 둡니다.

## 5. API 경로는 평소 수정하지 않음

Secret Key 재발급과 API 경로 변경은 다른 작업입니다. 평소에는 Secret Key만 교체합니다. 쿠팡 개발자센터에서 특정 API의 Path가 변경됐다고 공지된 경우에만 다음을 펼칩니다.

```text
설정 → 고급: API 경로
```

변경된 기능 한 줄만 수정하고 서버 저장 후 주문 API 진단을 실행합니다.
