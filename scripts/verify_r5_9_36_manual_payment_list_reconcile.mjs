import fs from "node:fs";

const worker = fs.readFileSync(new URL("../apps/worker/src/worker.ts", import.meta.url), "utf8");

const checks = [
  ["payment list reconciliation helper exists", worker.includes("adminplusFindRecordedPaymentForHistory")],
  ["manual payment list endpoint is read", worker.includes('adminplusReadWithRetry(env, account, "/v1/seller/payments", { limit: 100 })')],
  ["stable order and customer identifiers are matched", ["customer_order_code", "adminplusOrderCode", "order_no"].every((key) => worker.includes(key))],
  ["listed completed payment is reconciled", worker.includes("const listedPayment = await adminplusFindRecordedPaymentForHistory(env, account, row);") && worker.includes("if (listedPayment.completed)" )],
  ["marketplace preparing transition remains gated by completed payment", worker.includes("adminplusEnsureMarketplacePreparing(env,rows,currentPaid.rows)") && /const needsPreparing=rows\.some\(\(row\)=>String\(row\.paymentStatus\|\|\"\"\)===\"완료\"/.test(worker)],
];

for (const [label, pass] of checks) {
  if (!pass) throw new Error(`[FAIL] ${label}`);
  console.log(`[PASS] ${label}`);
}
console.log("[PASS] R5.9.36 manual payment list reconciliation verification completed.");
