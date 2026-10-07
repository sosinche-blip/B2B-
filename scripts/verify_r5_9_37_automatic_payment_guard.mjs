import fs from "node:fs";

const worker = fs.readFileSync(new URL("../apps/worker/src/worker.ts", import.meta.url), "utf8");

const checks = [
  ["manual execute protects server payment policies", worker.includes("protectAdminPlusPaymentPolicies(serverPayload, payload)")],
  ["automatic payment OFF is an explicit execution error", worker.includes('stage: "payment_policy_off"') && worker.includes("결제정책 서버저장 후 다시 실행하세요")],
  ["zero payment limits are an explicit execution error", worker.includes('stage: "payment_limit_policy"') && worker.includes("자동결제 한도(1회/일일)")],
  ["payment blockers preserve pending state", worker.includes('row.paymentStatus = row.paymentStatus || "대기"') && worker.includes('row.paymentStatus = "대기"')],
  ["real payment remains guarded by pending amount and balance", worker.includes("adminplusPendingPaymentAmountWithRetry(") && worker.includes("balance.depositBalance < amount")],
  ["successful payment still reconciles marketplace preparing", worker.includes("adminplusEnsureMarketplacePreparing(env, nextHistory, collected.rows)")],
];

for (const [label, pass] of checks) {
  if (!pass) throw new Error(`[FAIL] ${label}`);
  console.log(`[PASS] ${label}`);
}
console.log("[PASS] R5.9.37 automatic payment guard verification completed.");
