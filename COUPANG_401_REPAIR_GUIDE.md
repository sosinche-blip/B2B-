# 쿠팡 HTTP 401 Invalid signature 수정 안내

## 반영한 수정
1. Access Key, Secret Key, Vendor ID의 앞뒤 공백·개행·실수로 포함된 바깥 따옴표를 제거합니다.
2. 쿠팡 공식 UTC signed-date 형식을 명시적으로 생성합니다.
3. HMAC에 사용한 path/query와 실제 fetch URL에 사용한 path/query를 동일 문자열로 유지합니다.
4. `X-Requested-By`, `X-MARKET: KR`, `X-EXTENDED-TIMEOUT` 헤더를 추가했습니다.
5. 401 발생 시 키 조합/서버 시간/NTP/공백을 바로 확인하도록 진단 메시지를 보강했습니다.

## Ncloud에서 반드시 확인
```bash
sudo timedatectl set-ntp true
timedatectl status
```
`System clock synchronized: yes`가 되어야 합니다.

환경변수는 실제 값으로 입력하되 값 안에 따옴표를 포함하지 마세요.
```bash
COUPANG_VENDOR_ID=A01523690
COUPANG_ACCESS_KEY=실제_ACCESS_KEY
COUPANG_SECRET_KEY=실제_SECRET_KEY
```

systemd 환경파일을 수정했다면:
```bash
sudo systemctl daemon-reload
sudo systemctl restart b2b-ncloud-api
sudo journalctl -u b2b-ncloud-api -n 100 --no-pager
```

## 중요
- Access Key와 Secret Key는 반드시 같은 Open API 키 세트여야 합니다.
- Vendor ID도 그 키를 발급받은 판매자 계정의 업체코드여야 합니다.
- 서명은 요청마다 새로 생성되어야 합니다.
- v5 일단위 페이징의 `createdAtFrom/To=YYYY-MM-DD+09:00` 형식은 현재 공식 문서와 일치합니다.
