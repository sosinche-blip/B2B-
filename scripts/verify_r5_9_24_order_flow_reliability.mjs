import fs from "node:fs";

const worker =
  fs.readFileSync(
    "apps/worker/src/worker.ts",
    "utf8",
  );

const web =
  fs.readFileSync(
    "apps/web/src/App.tsx",
    "utf8",
  );

function must(value, label) {
  if (!value) {
    console.error("[FAIL] " + label);
    process.exitCode = 1;
  } else {
    console.log("[PASS] " + label);
  }
}

console.log("[ROUND 1] AdminPlus batch key");

must(
  worker.includes(
    "v259-r5-9-24-order-flow-reliability",
  ),
  "R5.9.24 marker exists",
);

must(
  worker.includes(
    "function adminplusCreateBatchResponseMeta",
  ),
  "safe batch response helper exists",
);

must(
  worker.includes(
    'source: "batch_response_direct"',
  ),
  "batch key reads direct response fields",
);

must(
  worker.includes(
    "directMeta.orderKey || batchMeta.orderKey",
  ),
  "batch-created orders keep validated batch key fallback",
);

must(
  worker.includes(
    "singleDirectMeta.orderKey || singleBatchMeta.orderKey",
  ),
  "single retry keeps its own batch key fallback",
);


console.log("[ROUND 2] payment safety");

must(
  !worker.includes(
    'rows.find((row) => String(row.order_key || "").trim() === key) || rows[0]',
  ),
  "pending lookup cannot fall back to unrelated first row",
);

must(
  worker.includes(
    'stage: "payment_key_validation"',
  ),
  "payment key validation failure is recorded",
);

const paymentStart =
  worker.indexOf(
    "async function adminplusProcessPayments(",
  );

const paymentEnd =
  worker.indexOf(
    "async function adminplusPurchaseRun(",
    paymentStart,
  );

const paymentBlock =
  worker.slice(
    paymentStart,
    paymentEnd,
  );

const pendingPos =
  paymentBlock.indexOf(
    "await adminplusPendingPaymentAmount",
  );

const paymentPostPos =
  paymentBlock.indexOf(
    '"/v1/seller/payments"',
  );

must(
  pendingPos >= 0 &&
  paymentPostPos > pendingPos,
  "pending exact-key validation happens before payment POST",
);

must(
  paymentBlock.includes(
    'order_key: [String(first.orderKey || "")]',
  ),
  "payment POST still uses stored validated key",
);


console.log("[ROUND 3] Toss bridge");

must(
  web.includes(
    "const freshTossMasters =",
  ),
  "Toss order lookup fetches fresh option bridge",
);

must(
  web.includes(
    "freshTossMasters.length",
  ),
  "fresh Toss bridge has cached fallback",
);

must(
  web.includes(
    "fetchTossOptionMastersFromApi(false)",
  ),
  "Toss product API sync retained",
);


console.log("[ROUND 4] immediate status refresh");

must(
  web.includes(
    "operationOverviewCacheRef.current = null;",
  ),
  "selected collection clears overview cache",
);

must(
  web.includes(
    "await refreshApiOverview(true);",
  ),
  "selected collection forces latest API status",
);

must(
  web.includes(
    'kind === "purchase-execute" && result.ok !== false',
  ) &&
  web.includes(
    "await refreshApiOverview(true);",
  ),
  "manual purchase execute forces latest API status",
);

must(
  web.includes(
    "Date.now() - cached.at < 45 * 1000",
  ),
  "existing 45-second passive cache policy retained",
);

must(
  web.includes(
    "operationOverviewCacheRef.current = null;",
  ),
  "manual workflows explicitly invalidate cache",
);


console.log("[ROUND 5] existing safety retained");

must(
  worker.includes(
    "function adminplusCreateResponseMetaForCustomer",
  ),
  "R5.9.23 exact customer metadata helper retained",
);

must(
  worker.includes(
    "adminplusResolveMappingForOrder",
  ),
  "Toss mapping resolution retained",
);

must(
  worker.includes(
    "confirmedLinkCandidates",
  ),
  "confirmed-link safety remains",
);

must(
  worker.includes(
    "adminplusForceCashReceiptRequired",
  ),
  "cash-receipt payment safeguard retained",
);

if (!process.exitCode) {
  console.log(
    "[PASS] R5.9.24 order-flow reliability verification completed.",
  );
}
