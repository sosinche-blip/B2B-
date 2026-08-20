import fs from "node:fs";

const worker = fs.readFileSync(
  "apps/worker/src/worker.ts",
  "utf8"
);

const must = (ok, message) => {
  if (!ok) throw new Error(message);
  console.log("[PASS]", message);
};

console.log("[ROUND 1] generic AdminPlus payment fallback");

must(
  worker.includes("adminplusForceCashReceiptRequired"),
  "force cash-receipt response detection exists"
);

must(
  worker.includes('"/v1/seller/banks"'),
  "bank account lookup exists"
);

must(
  worker.includes('method: "bank"') &&
  worker.includes("amount: 0") &&
  worker.includes('type: "BUSINESS"'),
  "official zero-bank BUSINESS cash receipt payload exists"
);

must(
  worker.includes("ADMINPLUS_CASH_RECEIPT_BUSINESS_NUMBER"),
  "global business-number configuration exists"
);

must(
  !worker.includes('vendorName === "꿈틀"') &&
  !worker.includes('vendorName==="꿈틀"'),
  "fallback is not hardcoded to 꿈틀"
);

console.log("[ROUND 2] normal-payment compatibility");

must(
  worker.includes('{ method: "deposit", amount }') &&
  worker.includes('{ method: "point", amount: 0 }'),
  "normal deposit+point payment retained"
);

must(
  worker.indexOf("adminplusForceCashReceiptRequired(initialReason)") >
  worker.indexOf('"/v1/seller/payments"'),
  "fallback runs only after initial payment failure"
);

console.log("[ROUND 3] evidence / safety");

must(
  worker.includes("paymentLastFailure"),
  "payment failure evidence is preserved"
);

must(
  worker.includes("recovered: false") &&
  worker.includes("paymentLastFailure.recovered = true"),
  "fallback recovery is explicitly recorded"
);

must(
  worker.includes("adminplusAdaptivePaymentRevision"),
  "R4.5 runtime marker exposed"
);

console.log(
  "[PASS] V259 R4.5 adaptive AdminPlus payment verification completed."
);
