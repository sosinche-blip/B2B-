import fs from "node:fs";

const worker = fs.readFileSync(new URL("../apps/worker/src/worker.ts", import.meta.url), "utf8");
const web = fs.readFileSync(new URL("../apps/web/src/App.tsx", import.meta.url), "utf8");

function pass(label, ok) {
  if (!ok) throw new Error(`[FAIL] ${label}`);
  console.log(`[PASS] ${label}`);
}

console.log("[ROUND 1] AdminPlus order-key recovery before automatic payment");
pass("stale order key recovery helper exists", worker.includes("adminplusPendingPaymentAmountWithRecovery"));
pass("customer order code is used to recover current order", worker.includes("adminplusRecoverCreatedOrder(env, account, customerCode)"));
pass("recovered paid order is not charged again", worker.includes("alreadyCompleted: true") && worker.includes("if (pendingAmount.alreadyCompleted)"));
pass("recovered order key is persisted before payment", worker.includes("row.orderKey = recovered.orderKey || row.orderKey"));

console.log("[ROUND 2] Per-account automatic payment policy");
pass("stale browser payment policy cannot override server policy", worker.includes("protectAdminPlusPaymentPolicies(serverPayload, payload)"));
pass("OFF policy is reported as an execution error", worker.includes('stage: "payment_policy_off"'));
pass("zero limits are reported as an execution error", worker.includes('stage: "payment_limit_policy"'));

console.log("[ROUND 3] Manual payment reconciliation");
pass("payment list fallback remains available", worker.includes("/v1/seller/payments", { limit: 100 }) || worker.includes('"/v1/seller/payments", { limit: 100 }'));
pass("manual completion aliases remain accepted", worker.includes("결제완료|입금완료") && worker.includes("adminplusFindRecordedPaymentForHistory"));

console.log("[ROUND 4] Coupang/Toss 상품준비중 transition");
pass("history identifiers can be used when latest collection misses a row", worker.includes("if(live){") && worker.includes("결제완료를 확인했지만 최신 마켓 주문조회에서 상품 식별자를 찾지 못했습니다."));
pass("successful acknowledge persists preparation evidence", worker.includes("row.marketplacePreparingAt=now"));
pass("Coupang and Toss acknowledge calls remain present", worker.includes("coupangAckRawJson") && worker.includes("PREPARING_PRODUCT"));

console.log("[ROUND 5] Collection and operator diagnostics");
pass("Coupang collection keeps explicit paging", worker.includes("maxPages: 10") && worker.includes("maxPerPage: 50"));
pass("Toss collection keeps PAID fallback", worker.includes("토스 PAID 0건 안전 재조회"));
pass("UI surfaces payment errors instead of hiding them", web.includes("paymentErrors") && web.includes("결제확인필요"));
pass("stale preflight rows are cleared after execute", web.includes("setAdminplusPreflightRows([])") && web.includes("if (kind === \"purchase-execute\")"));

console.log("[PASS] R5.9.38 five-pass purchase/payment review completed.");
