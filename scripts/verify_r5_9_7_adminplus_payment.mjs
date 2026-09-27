import fs from "node:fs";

const worker = fs.readFileSync(
  "apps/worker/src/worker.ts",
  "utf8",
);

function must(ok, label) {
  if (!ok) {
    console.error("[FAIL]", label);
    process.exit(1);
  }
  console.log("[PASS]", label);
}

console.log("[ROUND 1] safe AdminPlus read retry");

must(
  worker.includes("function adminplusRetryableReadResult") &&
    worker.includes("async function adminplusReadWithRetry"),
  "AdminPlus GET retry helper exists",
);

must(
  worker.includes("[408, 425, 429, 500, 502, 503, 504]"),
  "transient HTTP statuses retry",
);

must(
  worker.includes(
    'adminplusReadWithRetry(env, account, "/v1/seller/balance")',
  ),
  "balance uses read retry",
);

must(
  worker.includes(
    'adminplusReadWithRetry(env, account, "/v1/seller/payments", { payment_key: key, limit: 10 })',
  ),
  "payment status uses read retry",
);

console.log("[ROUND 2] duplicate payment safety");

must(
  worker.includes(
    'payment = await adminplusRequest(',
  ) &&
    worker.includes(
      '"POST",\n      "/v1/seller/payments"',
    ),
  "payment POST remains direct and is not blindly retried",
);

must(
  !worker.includes(
    'adminplusReadWithRetry(env, account, "/v1/seller/payments", undefined',
  ),
  "GET retry helper is not used for payment POST",
);

console.log("[ROUND 3] speed + diagnostics");

must(
  worker.includes("freshNewPaymentGroup") &&
    worker.includes("Date.now() - submittedMs < 2 * 60 * 1000"),
  "fresh order redundant reconcile is skipped",
);

must(
  worker.includes("function adminplusRememberPaymentFailure") &&
    worker.includes("[ADMINPLUS_PAYMENT_FAILURE]"),
  "pre-POST payment failures remain diagnosable",
);

must(
  worker.includes('"balance_insufficient"') &&
    worker.includes('"payment_status"'),
  "balance/status failures preserve evidence",
);

must(
  !worker.includes(
    "errors.push(...reconciled.errors);",
  ),
  "successful payment no longer keeps stale reconcile error",
);

console.log("[ROUND 4] existing payment safety");

must(
  worker.includes(
    "adminplusForceCashReceiptRequired(initialReason)",
  ),
  "R4.5 adaptive cash receipt retained",
);

must(
  worker.includes('for (const wait of [0, 800, 2000])') &&
    worker.includes('for (const wait of [0, 1000, 2500])'),
  "payment completion confirmation safety retained",
);

must(
  worker.includes("paymentLastFailure.recovered = true"),
  "existing cash receipt recovery evidence retained",
);

console.log(
  "[PASS] R5.9.7 AdminPlus payment stability verification completed.",
);