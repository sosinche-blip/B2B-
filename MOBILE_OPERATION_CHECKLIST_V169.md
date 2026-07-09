# V169 모바일 운영 점검표

## 모바일에서 바로 가능한 작업

- 주문 수집 버튼 실행
- 업체별 발주파일 생성 확인
- 발주폴더 파일목록 확인 및 ZIP 다운로드
- 업체송장 파일 업로드/복사 흐름 확인
- 쿠팡+토스 업로드 실행
- 쿠폰 목록 조회, 여러 쿠폰 반복대상 저장
- 스케줄러 로그 확인

## 모바일 운영 전 필수 점검

1. Supabase 스키마 적용 완료
2. Worker Secret 입력 완료
3. `ALLOW_LIVE_EXTERNAL_API=true`
4. `ALLOW_FINAL_EXECUTION=true`
5. `ALLOW_SCHEDULED_WRITES=true`
6. 쿠팡 허용 IP 등록 완료
7. 토스 API Key 정상
8. 발주폴더 기준 파일 생성 테스트 완료
9. 송장 매칭 확인표 다운로드 테스트 완료
10. 쿠폰 23:50/23:51 스케줄러 로그 확인

## 파일 운영 주의

모바일 브라우저는 PC 로컬 폴더를 직접 열 수 없습니다. 현재 V169는 PC/Ncloud 서버의 발주폴더를 보조 API로 읽어 모바일에서 목록·다운로드를 지원합니다. 완전 클라우드 파일 보관이 필요하면 다음 단계에서 Supabase Storage 또는 Ncloud Object Storage 연동이 필요합니다.
