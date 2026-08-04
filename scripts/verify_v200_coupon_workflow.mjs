import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const app = fs.readFileSync(path.join(root, "apps/web/src/App.tsx"), "utf8");
const style = fs.readFileSync(path.join(root, "apps/web/src/style.css"), "utf8");
const worker = fs.readFileSync(path.join(root, "apps/worker/src/worker.ts"), "utf8");

const checks = [
  [app.includes('V200 쿠폰 실행흐름·취소확인 개선본'), "V200 화면 버전"],
  [app.includes('onClick={lookupCouponOptionIds}') && app.includes('API 옵션ID 조회'), "API 옵션ID 조회 버튼"],
  [app.includes('onClick={runNewCouponPreflight}') && app.includes('신규 쿠폰 사전검증'), "신규 쿠폰 사전검증 버튼"],
  [app.includes('onClick={applyNewCouponNow}') && app.includes('>즉시 적용</button>'), "새 쿠폰 즉시 적용 버튼"],
  [app.includes('onClick={scheduleNewCouponFromNextIssue}') && app.includes('>다음 발행부터</button>'), "새 쿠폰 다음 발행 버튼"],
  [app.includes('아직 쿠폰은 발행되지 않았습니다'), "사전검증과 발행의 명확한 구분"],
  [app.includes('coupon-workflow-section') && app.includes('기존 쿠폰에서 반복대상 추가'), "연관 기능 그룹 배치"],
  [app.includes('coupon-list-actions') && app.includes('선택 쿠폰 반복대상 추가'), "기존 쿠폰 목록 바로 아래 작업 버튼"],
  [style.includes('.coupon-new-actions { grid-template-columns: repeat(4'), "새 쿠폰 4개 실행 버튼 레이아웃"],
  [worker.includes('delays: [0, 10_000, 20_000]'), "쿠폰 취소 0·10·30초 상태 확인"],
  [worker.includes('type CouponRetryStage = "cancel" | "cancel_status"'), "취소 요청상태 전용 재확인 단계"],
  [worker.includes('resolvePendingCouponCancelOperations'), "파기 requestedId 상태 재확인"],
  [worker.includes('v200-coupon-workflow-lifecycle'), "V200 서버 버전 마커"],
  [!worker.includes('retryImmediate(() => runCoupangCouponCancel'), "동일 쿠폰 파기 요청 중복 전송 방지"],
];

let failed = false;
for (const [ok, label] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
console.log("V200 coupon workflow verification passed.");
