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
  "[ROUND 1] exception-first dashboard",
);

must(
  app.includes(
    "v259-r5-9-14-operation-exception-dashboard",
  ),
  "R5.9.14 dashboard marker exists",
);

must(
  app.includes(
    "const operationExceptionCount",
  ),
  "aggregate exception count exists",
);

must(
  app.includes(
    "purchasePreflightBlocked.length",
  ),
  "purchase blocking is surfaced",
);

must(
  app.includes(
    "unresolvedOperationalFailures.length",
  ),
  "operational failures are surfaced",
);

must(
  app.includes(
    "addressQualityBlocked.length",
  ),
  "address blocking is surfaced",
);

must(
  app.includes(
    "openAdminPlusPriceAlerts.length",
  ),
  "price alerts are surfaced",
);

must(
  app.includes(
    "couponAutomationFailures.length",
  ),
  "coupon failures are surfaced",
);

console.log(
  "[ROUND 2] existing operation flow retained",
);

must(
  app.includes(
    "operation-control-metrics operation-status-metrics",
  ),
  "existing status metrics remain",
);

must(
  app.includes(
    "operation-control-metrics operation-watch-metrics",
  ),
  "existing watch metrics remain",
);

must(
  app.includes(
    "renderOperationMetricDetail()",
  ),
  "existing detail view remains",
);

must(
  app.includes(
    "주소 품질검사",
  ),
  "existing address detail remains",
);

console.log(
  "[ROUND 3] UI only",
);

must(
  css.includes(
    "V259 R5.9.14 operation exception dashboard",
  ),
  "R5.9.14 CSS exists",
);

must(
  css.includes(
    ".operation-exception-grid",
  ),
  "responsive exception grid exists",
);

must(
  css.includes(
    ".operation-exception-card.is-critical",
  ),
  "critical visual state exists",
);

must(
  css.includes(
    ".operation-exception-card.is-warning",
  ),
  "warning visual state exists",
);

must(
  css.includes(
    ".operation-exception-card.is-ok",
  ),
  "healthy visual state exists",
);

console.log(
  "[ROUND 4] safety",
);

must(
  !app.includes(
    "v259-r5-9-14-operation-exception-dashboard-purchase",
  ),
  "dashboard introduces no purchase action marker",
);

if (!process.exitCode) {
  console.log(
    "[PASS] R5.9.14 operation exception dashboard verification completed.",
  );
}
