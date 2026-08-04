# 웹앱 V200 쉬운 배포 안내

## 배포 전 확인

먼저 Ncloud V197 쿠폰 생명주기 개선본을 배포하고 상태 API에서 아래 버전을 확인하세요.

```text
v200-coupon-workflow-lifecycle
```

## 웹앱 배포

1. 현재 GitHub 저장소를 `Code → Download ZIP`으로 백업합니다.
2. `B2B_OPERATION_MASTER_V200_COUPON_WORKFLOW_LIFECYCLE.zip`을 압축 해제합니다.
3. 바깥 폴더가 아니라 압축을 푼 폴더 **안의 파일과 폴더 전체**를 GitHub 저장소의 `main` 브랜치에 업로드합니다.
4. 커밋 메시지 예시:

```text
Deploy V200 coupon workflow lifecycle fix
```

5. GitHub `Actions`에서 배포 작업이 초록색 성공인지 확인합니다.
6. Cloudflare `Workers & Pages → b2b-bpt → Deployments`에서 최신 Production 배포가 Success인지 확인합니다.
7. 웹앱을 열고 `Ctrl + F5`로 강력 새로고침합니다.

## 화면 확인

쿠폰 메뉴에서 다음 세 영역이 순서대로 보여야 합니다.

1. 새 쿠폰 직접 등록
2. 기존 쿠폰에서 반복대상 추가
3. 24시간 반복대상 관리

새 쿠폰 직접 등록 영역에는 다음 네 버튼이 함께 있어야 합니다.

```text
API 옵션ID 조회
신규 쿠폰 사전검증
즉시 적용
다음 발행부터
```

사전검증 통과 뒤에도 쿠폰은 아직 발행되지 않습니다. 실제 발행은 `즉시 적용` 또는 `다음 발행부터`를 눌러야 진행됩니다.
