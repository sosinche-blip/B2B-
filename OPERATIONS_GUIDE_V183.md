# V183 운영 적용 순서

1. Cloudflare R2에서 `b2b-operation-files` 버킷을 생성합니다.
2. GitHub에 V183 소스를 반영하고 main 브랜치에 push합니다.
3. GitHub Actions가 검증 후 Worker를 배포합니다.
4. Cloudflare Pages는 기존 GitHub 연결로 웹을 다시 빌드합니다.
5. Ncloud는 현재 V181 서비스와 `.dev.vars`를 유지합니다. V183 전체 ZIP을 Ncloud에 올릴 필요가 없습니다.
6. 업체송장 버튼으로 여러 엑셀을 선택한 뒤 R2 발주폴더 저장 결과를 확인합니다.
7. 쿠팡+토스 업로드 전에 미매칭/중복/필수값 누락 건수를 확인합니다.

## R2 객체 경로
- `b2b-operation/purchase/`: 발주 및 업체송장, 채널 입력/결과파일
- `b2b-operation/invoice/`: 호환용 송장 영역
- `b2b-operation/upload/`: 업로드 결과 영역

## 안전 원칙
- API 비밀키는 Ncloud `.dev.vars` 또는 Cloudflare Secrets에만 저장합니다.
- GitHub 저장소와 ZIP에는 실제 키를 넣지 않습니다.
- 실제 송장 업데이트는 등록준비 건만 실행하고 확인필요 건은 제외합니다.
