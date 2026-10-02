import fs from "node:fs";

const app =
  fs.readFileSync(
    "apps/web/src/App.tsx",
    "utf8",
  );

const worker =
  fs.readFileSync(
    "apps/worker/src/worker.ts",
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

console.log("[ROUND 1] recent price alert policy");

must(
  app.includes(
    "v259-r5-9-25-stale-alert-cleanup",
  ),
  "R5.9.25 marker exists",
);

must(
  app.includes(
    "const recentOpenAdminPlusPriceAlerts = useMemo",
  ),
  "recent price alert list exists",
);

must(
  app.includes(
    "7 * 24 * 60 * 60 * 1000",
  ),
  "dashboard window is seven days",
);

must(
  app.includes(
    "최근 7일 가격·품절 변동",
  ),
  "daily dashboard explains seven-day scope",
);


console.log("[ROUND 2] coupon stale-failure policy");

must(
  app.includes(
    "const actionableCouponAutomationFailures = useMemo",
  ),
  "actionable coupon failure list exists",
);

must(
  app.includes(
    ".filter((template) => template.enabled)",
  ),
  "only currently enabled coupon templates count as actionable",
);

must(
  app.includes(
    "현재 운영대상 쿠폰 실패",
  ),
  "dashboard identifies current coupon failures",
);


console.log("[ROUND 3] soldout dedupe");

must(
  worker.includes(
    "const alreadySoldout =",
  ),
  "soldout duplicate guard exists",
);

must(
  worker.includes(
    'String(row.alertKind || "") === "품절"',
  ),
  "soldout duplicate guard uses alert kind",
);

must(
  worker.includes(
    "const wasAlreadySoldout =",
  ),
  "previous soldout state is remembered",
);

must(
  worker.includes(
    "if (!wasAlreadySoldout && !alreadySoldout) alerts.push({",
  ),
  "persistent soldout does not recreate alert after acknowledgement",
);

must(
  worker.includes(
    "if (!wasAlreadySoldout && !alreadyMissing) alerts.push({",
  ),
  "missing-product soldout alert is transition-only",
);


console.log("[ROUND 4] history retained");

must(
  app.includes(
    "const openAdminPlusPriceAlerts = useMemo",
  ),
  "full unacknowledged price history remains available",
);

must(
  app.includes(
    'callApi("/api/integrations/coupang/coupons/automation-failures?status=unacknowledged")',
  ),
  "coupon failure source remains intact",
);


console.log("[ROUND 5] R5.9.24 retained");

must(
  worker.includes(
    "v259-r5-9-24-order-flow-reliability",
  ),
  "R5.9.24 payment fix retained",
);

must(
  worker.includes(
    'stage: "payment_key_validation"',
  ),
  "R5.9.24 payment validation retained",
);

must(
  app.includes(
    "const freshTossMasters =",
  ),
  "R5.9.24 Toss fresh bridge retained",
);

must(
  app.includes(
    "Date.now() - cached.at < 45 * 1000",
  ),
  "45-second passive dashboard cache retained",
);

if (!process.exitCode) {
  console.log(
    "[PASS] R5.9.25 stale-alert cleanup verification completed.",
  );
}
