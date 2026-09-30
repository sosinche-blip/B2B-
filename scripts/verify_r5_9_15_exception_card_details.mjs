import fs from "node:fs";

const app =
  fs.readFileSync(
    "apps/web/src/App.tsx",
    "utf8",
  );

const css =
  fs.readFileSync(
    "apps/web/src/style.css",
    "utf8",
  );

function must(
  value,
  label,
) {
  if (!value) {
    console.error(
      "[FAIL] " + label,
    );
    process.exitCode = 1;
  } else {
    console.log(
      "[PASS] " + label,
    );
  }
}

console.log(
  "[ROUND 1] detail state + navigation",
);

must(
  app.includes(
    "v259-r5-9-15-exception-card-detail-navigation",
  ),
  "R5.9.15 marker exists",
);

must(
  app.includes(
    "operationExceptionDetail",
  ),
  "exception detail state exists",
);

must(
  app.includes(
    'getElementById("operation-exception-detail")',
  ),
  "detail scroll target exists",
);

must(
  app.includes(
    "renderOperationExceptionDetail()",
  ),
  "detail renderer exists",
);

console.log(
  "[ROUND 2] all five cards are interactive",
);

for (const kind of [
  "purchase",
  "failure",
  "address",
  "price",
  "coupon",
]) {
  must(
    app.includes(
      `openOperationExceptionDetail("${kind}")`,
    ),
    `${kind} card opens detail`,
  );
}

must(
  app.includes(
    'id="operation-exception-detail"',
  ),
  "detail panel has stable scroll id",
);

console.log(
  "[ROUND 3] detail sources",
);

must(
  app.includes(
    "purchasePreflightBlocked.map",
  ),
  "purchase blocked detail uses existing source",
);

must(
  app.includes(
    "unresolvedOperationalFailures.map",
  ),
  "operational failure detail uses existing source",
);

must(
  app.includes(
    "addressQualityBlocked.map",
  ),
  "address detail uses existing source",
);

must(
  app.includes(
    "openAdminPlusPriceAlerts.map",
  ),
  "price detail uses existing source",
);

must(
  app.includes(
    "couponAutomationFailures.map",
  ),
  "coupon detail uses existing source",
);

console.log(
  "[ROUND 4] existing R5.9.14 retained",
);

must(
  app.includes(
    "v259-r5-9-14-operation-exception-dashboard",
  ),
  "R5.9.14 exception-first dashboard retained",
);

must(
  app.includes(
    "operation-control-metrics operation-status-metrics",
  ),
  "normal operation status remains",
);

must(
  app.includes(
    "operation-control-metrics operation-watch-metrics",
  ),
  "watch metrics remain",
);

must(
  css.includes(
    "V259 R5.9.15 exception card detail navigation",
  ),
  "R5.9.15 CSS exists",
);

console.log(
  "[ROUND 5] no destructive operation wiring",
);

must(
  !app.includes(
    "v259-r5-9-15-purchase-execute",
  ),
  "no purchase execution marker introduced",
);

must(
  !app.includes(
    "v259-r5-9-15-payment-execute",
  ),
  "no payment execution marker introduced",
);

must(
  !app.includes(
    "v259-r5-9-15-coupon-execute",
  ),
  "no coupon execution marker introduced",
);

if (!process.exitCode) {
  console.log(
    "[PASS] R5.9.15 exception card detail navigation verification completed.",
  );
}
