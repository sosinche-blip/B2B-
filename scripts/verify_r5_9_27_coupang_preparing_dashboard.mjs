import fs from "node:fs";

const app =
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

console.log(
  "[ROUND 1] R5.9.27 Coupang preparing",
);

must(
  app.includes(
    "v259-r5-9-27-coupang-preparing-dashboard",
  ),
  "R5.9.27 marker exists",
);

must(
  app.includes(
    '["쿠팡", "INSTRUCT", "preparing"]',
  ),
  "Coupang preparing query remains INSTRUCT",
);

must(
  app.includes(
    "text(row.orderStatus) ||",
  ),
  "blank orderStatus fallback exists",
);

must(
  app.includes(
    'return normalized === "instruct" || normalized.includes("instruct");',
  ),
  "INSTRUCT preparing classifier retained",
);


console.log(
  "[ROUND 2] V257 compatibility",
);

must(
  app.includes(
    "startDate = orderApiFilter.startDate",
  ) &&
  app.includes(
    "endDate = orderApiFilter.endDate",
  ),
  "shared selected date range retained",
);

must(
  app.includes(
    "query.maxPerPage = 50",
  ) &&
  app.includes(
    "query.maxPages = 10",
  ),
  "Coupang explicit paging retained",
);

must(
  app.includes(
    "rawRows: Number(result.summary?.rawRows",
  ),
  "raw API count retained",
);

must(
  app.includes(
    "normalizedRows: Number(result.summary?.normalizedRows",
  ),
  "normalized API count retained",
);

must(
  app.includes(
    "fetchOperationStatus(channel, status, orderApiFilter.startDate, orderApiFilter.endDate)",
  ),
  "V257 status-call contract retained",
);

must(
  app.includes(
    "for (const [channel, status, bucket] of specs)",
  ),
  "sequential status query retained",
);

must(
  app.includes(
    "조회실패 ${failed}건",
  ),
  "partial query failure remains visible",
);


console.log(
  "[ROUND 3] recent regressions",
);

must(
  app.includes(
    "v259-r5-9-26-toss-exact-link-recovery",
  ),
  "R5.9.26 retained",
);

must(
  app.includes(
    "v259-r5-9-25-stale-alert-cleanup",
  ),
  "R5.9.25 retained",
);

must(
  app.includes(
    "Date.now() - cached.at < 45 * 1000",
  ),
  "45-second passive cache retained",
);

if (!process.exitCode) {
  console.log(
    "[PASS] R5.9.27 final compatibility verification completed.",
  );
}
