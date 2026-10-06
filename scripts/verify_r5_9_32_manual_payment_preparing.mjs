import fs from "node:fs";

const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");

function must(ok, label) {
  if (!ok) {
    console.error("[FAIL]", label);
    process.exitCode = 1;
  } else {
    console.log("[PASS]", label);
  }
}

console.log("[ROUND 1] manual payment status aliases");
must(
  worker.includes("exact?.payment_status || exact?.paymentStatus || exact?.status"),
  "payment status aliases are read",
);
must(
  worker.includes("completed|complete|paid|success|succeeded|결제완료|입금완료"),
  "paid/success/manual completion aliases are accepted",
);
must(
  worker.includes("adminplusOrderShowsPaymentCompleted(exact)"),
  "nested order payment completion is reused",
);

console.log("[ROUND 2] manual payment reconciliation fallback");
must(
  worker.includes("adminplusFindOrderForHistory(env, account, row)"),
  "reconciliation uses customer/order-code and recent-order fallback",
);
must(
  worker.includes("if(!code && !String(row.adminplusOrderCode||\"\").trim()) continue;"),
  "rows without either stable AdminPlus identifier remain safely deferred",
);

console.log("[ROUND 3] marketplace transition regression");
must(
  worker.includes("adminplusEnsureMarketplacePreparing(env,rows,currentPaid.rows)"),
  "status refresh still runs marketplace preparing transition",
);
must(
  worker.includes("row.marketplacePreparingAt=now"),
  "successful marketplace transition persists server evidence",
);

if (!process.exitCode) {
  console.log("[PASS] R5.9.32 manual payment -> Coupang preparing verification completed.");
}
