import fs from "node:fs";

const web = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");

const checks = [
  [
    "R5.9 web marker",
    web.includes(
      "v259-r5-9-dashboard-catalog-performance-20260901",
    ),
  ],
  [
    "R5.9 worker marker",
    worker.includes(
      "v259-r5-9-dashboard-catalog-performance-20260901",
    ),
  ],
  [
    "default operation range is four days",
    web.includes(
      "const DEFAULT_OPERATION_LOOKBACK_DAYS = 4;",
    ) &&
      web.includes(
        "...dateRangeText(DEFAULT_OPERATION_LOOKBACK_DAYS)",
      ),
  ],
  [
    "manual date range controls retained",
    web.includes("value={orderApiFilter.startDate}") &&
      web.includes("value={orderApiFilter.endDate}"),
  ],
  [
    "dashboard keeps same-channel status calls sequential",
    web.includes(
      "for (const [channel, status, bucket] of specs)",
    ),
  ],
  [
    "dashboard runs Coupang and Toss groups in parallel",
    web.includes(
      "const [coupangResults, tossResults] = await Promise.all([",
    ) &&
      web.includes(
        "runOperationSpecsSequentially(coupangSpecs)",
      ) &&
      web.includes(
        "runOperationSpecsSequentially(tossSpecs)",
      ),
  ],
  [
    "dashboard short cache is 45 seconds",
    web.includes(
      "Date.now() - cached.at < 45 * 1000",
    ),
  ],
  [
    "manual dashboard refresh bypasses cache",
    web.includes(
      "refreshApiOverview(false, true)",
    ) &&
      web.includes(
        "refreshApiOverview(true, true)",
      ),
  ],
  [
    "AdminPlus catalog cache exists",
    worker.includes(
      "const ADMINPLUS_CATALOG_CACHE_TTL_MS = 3 * 60 * 1000;",
    ) &&
      worker.includes(
        "const adminplusCatalogCache = new Map",
      ),
  ],
  [
    "global catalog search uses cache",
    worker.includes(
      "adminplusCatalogProducts(env, account, 500, !activeUnlimitedOnly, true)",
    ),
  ],
  [
    "catalog listing endpoint uses cache",
    worker.includes(
      "adminplusCatalogProducts(env, account, Number(body.limit || 500), false, true)",
    ),
  ],
  [
    "match apply remains fresh",
    worker.includes(
      "const catalog = await adminplusCatalogProducts(env, account, 500, true);",
    ),
  ],
  [
    "price watch remains fresh",
    worker.includes(
      "const activeResult = await adminplusCatalogProducts(env, account, 500, false);",
    ) &&
      worker.includes(
        "const fullResult = await adminplusCatalogProducts(env, account, 500, true);",
      ),
  ],
  [
    "global search default result limit reduced",
    worker.includes(
      "Math.min(200, Number(body.limit || 100) || 100)",
    ) &&
      web.includes(
        "query, limit: 100, activeUnlimitedOnly",
      ),
  ],
  [
    "single-character product search is allowed",
    worker.includes("if (!query) return jsonResponse({") &&
      web.includes(
        "!text(adminplusGlobalSearchQuery).trim()",
      ),
  ],
  [
    "R5.8 identity safety retained",
    worker.includes("if (sameIdentity) return true;") &&
      !worker.includes("if (sameVendor) return true;"),
  ],
  [
    "R5.6 tombstone guard retained",
    worker.includes(
      "v259-r5-6-delete-tombstone-guard-20260828",
    ),
  ],
  [
    "R5.9 health release version exposed",
    worker.includes(
      'version: "v259-r5-9-dashboard-catalog-performance"',
    ),
  ],
  [
    "R5.8.1 health revision exposed",
    worker.includes(
      'productCodePrecedenceRevision: "v259-r5-8-1-product-code-precedence-20260901"',
    ),
  ],
  [
    "R5.9 health revision exposed",
    worker.includes(
      'dashboardCatalogPerformanceRevision: "v259-r5-9-dashboard-catalog-performance-20260901"',
    ),
  ],
  [
    "R4.5 payment retained",
    worker.includes(
      "v259-r4-5-adaptive-adminplus-cash-receipt-20260820",
    ),
  ],
];

let failed = 0;

for (const [label, ok] of checks) {
  console.log(ok ? "[PASS]" : "[FAIL]", label);
  if (!ok) failed += 1;
}

if (failed) {
  process.exit(1);
}

console.log(
  "\n[PASS] V259 R5.9 dashboard/catalog performance verification completed.",
);