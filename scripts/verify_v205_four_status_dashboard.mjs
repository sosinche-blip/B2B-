import fs from "node:fs";
const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");
const requiredApp = [
  "결제완료", "상품준비중", "배송중", "배송완료",
  "V205 안전 쿠폰교체·4단계 주문상태 점검본",
  'operationStatusRows', 'fetchOperationStatus',
  'onClick={() => applyRollingCouponTemplateNow(template.id)}>지금 쿠폰 교체</button>'
];
for (const token of requiredApp) { if (!app.includes(token)) throw new Error(`필수 UI/연결 누락: ${token}`); }
const requiredWorker = [
  "resolveActualAppliedCouponForOptions",
  "verifyCouponNoLongerApplied",
  "verifyCouponItemsActuallyApplied",
  "상품 0건 등 불완전 신규 쿠폰"
];
for (const token of requiredWorker) { if (!worker.includes(token)) throw new Error(`안전 쿠폰교체 로직 누락: ${token}`); }
const forbidden = ["배송확인", "needsDeliveryCheck", "deliveryCheckDeadline", 'operationMetricDetail === "deliveryCheck"'];
for (const token of forbidden) { if (app.includes(token)) throw new Error(`삭제되지 않은 배송확인 코드: ${token}`); }
console.log("V205 4단계 주문상태 + 안전 쿠폰교체 검증 통과");
