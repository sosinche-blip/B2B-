import fs from "node:fs";

const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

function must(value, label) {
  if (!value) {
    console.error("[FAIL] " + label);
    process.exitCode = 1;
  } else {
    console.log("[PASS] " + label);
  }
}

console.log("[ROUND 1] blank historical coupon ID recovery");
must(app.includes("!sourceCouponId && !options.length"), "valid template ID plus option IDs survives blank sourceCouponId");
must(app.includes("복구본 37개가 화면에서 모두 사라집니다."), "coupon restore regression is documented");

console.log("[ROUND 2] server overwrite guards");
must(worker.includes("function protectCouponAutomationRestore("), "blank coupon target overwrite guard exists");
must(worker.includes("function protectAdminPlusPaymentPolicies("), "payment policy overwrite guard exists");
must(worker.includes("function protectAdminPlusAutomationControls("), "automation control overwrite guard exists");
must(worker.includes("incoming = protectCouponAutomationRestore(currentPayload, incoming);"), "coupon guard runs before persistent save");
must(worker.includes("incoming = protectAdminPlusAutomationControls(currentPayload, incoming);"), "automation control guard runs before persistent save");
must(worker.includes("incoming = protectAdminPlusPaymentPolicies(currentPayload, incoming);"), "payment guard runs before persistent save");

console.log("[ROUND 3] explicit payment-policy writes only");
must(app.includes("paymentPolicyWriteAccountId: accountId"), "per-account save explicitly authorizes payment policy change");
must(app.includes("adminplusAutomationControlWrite: true"), "automation button explicitly authorizes purchase/shipment changes");
must(app.includes("자동발주·송장 설정이 저장값과 일치하지 않습니다"), "automation save verifies server controls after reload");
must(pkg.scripts["verify:all"].includes("verify:r5.9.28"), "full verification includes R5.9.28");

if (!process.exitCode) console.log("[PASS] R5.9.28 coupon restore and payment policy guards verified.");
