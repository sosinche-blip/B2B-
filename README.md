# B2B V218 옵션별 API 매핑 확정 보강

- `Error: success` 확정 오류를 수정했습니다.
- AdminPlus 저장 직후 재조회 지연에 대응해 최대 4회 검증합니다.
- B2B API 매핑은 엑셀 매핑의 `옵션ID`와 `기본수량`을 기준값으로 사용합니다.
- 같은 업체상품명을 여러 옵션ID가 공유해도 `B2B:<채널>:<옵션ID>` 독립 매칭으로 기본수량이 서로 덮어써지지 않습니다.
- 자동발주도 서버의 per-option 확정 링크를 사용합니다.
- 성공 후 과거 자동감시 저장 실패 상태가 운영점검판에 계속 남는 문제를 보강했습니다.
- featureRevision: `option-baseqty-confirm-v217-20260809`

## V218 R1 Worker TypeScript 핫픽스
- GitHub Actions에서 발생한 `normalized.updatedAt` TypeScript 추론 오류를 수정했습니다.
- 런타임 기능/featureRevision은 V218과 동일하며, 서버 확정 링크 병합 로직만 타입 안전하게 보강했습니다.
