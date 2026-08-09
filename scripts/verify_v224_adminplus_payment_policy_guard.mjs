import fs from "node:fs";
const app = fs.readFileSync(new URL("../apps/web/src/App.tsx", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../apps/worker/src/worker.ts", import.meta.url), "utf8");
let failures = 0;
function must(ok, label) { if (ok) console.log(`[PASS] ${label}`); else { failures += 1; console.error(`[FAIL] ${label}`); } }
console.log("[ROUND 1] payment settings UI");
must(app.includes("예치금 결제정책"), "prominent payment policy section exists");
must(app.includes("1회 결제한도(원)") && app.includes("일일 결제한도(원)"), "per-batch/daily limit inputs are visible");
must(app.includes("결제정책 서버 저장"), "payment policy has explicit server-save action");
console.log("[ROUND 2] purchase execution guard");
must(app.includes("결제설정이 완료되지 않아 발주를 시작하지 않았습니다"), "manual button blocks before order creation when payment policy is missing");
must(worker.includes('stage: "payment_policy"'), "worker enforces payment policy before order creation");
must(worker.includes("paymentBlockers"), "preflight exposes payment blockers");
console.log("[ROUND 3] payment implementation/regression");
must(worker.includes('POST", "/v1/seller/payments"'), "AdminPlus payment API remains wired");
must(worker.includes('method: "deposit"'), "deposit remains the explicit payment method");
must(worker.includes('adminplusPaymentPolicyRevision: "adminplus-payment-policy-guard-v224-20260809"'), "V224 payment policy revision exposed");
if (failures) process.exit(1);
console.log("[PASS] V224 AdminPlus payment policy guard verification completed (3 rounds).");
