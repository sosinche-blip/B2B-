import fs from "node:fs";

const worker = fs.readFileSync(
  "apps/worker/src/worker.ts",
  "utf8",
);

const pkg = JSON.parse(
  fs.readFileSync(
    "package.json",
    "utf8",
  ),
);

const start = worker.indexOf(
  "async function adminplusCatalogSearchPaged(",
);

const end = worker.indexOf(
  "async function adminplusCatalogMatches",
  start,
);

const searchBlock =
  start >= 0 && end > start
    ? worker.slice(start, end)
    : "";

function must(ok, label) {
  if (!ok) {
    console.error("[FAIL]", label);
    process.exitCode = 1;
    return;
  }

  console.log("[PASS]", label);
}

console.log(
  "[ROUND 1] adaptive timeout policy",
);

must(
  searchBlock.includes(
    "const FIRST_PAGE_TIMEOUT_MS = 15_000;",
  ),
  "first page timeout is 15 seconds",
);

must(
  searchBlock.includes(
    "const NEXT_PAGE_TIMEOUT_MS = 8_000;",
  ),
  "later page timeout is 8 seconds",
);

must(
  searchBlock.includes(
    "const ACCOUNT_BUDGET_MS = 24_000;",
  ),
  "per-account total budget exists",
);

must(
  searchBlock.includes(
    "remainingBudgetMs",
  ) &&
    searchBlock.includes(
      "configuredPageTimeoutMs",
    ),
  "page timeout respects account budget",
);

must(
  searchBlock.includes(
    "const query: Record<",
  ) &&
    searchBlock.includes(
      'query.status = "active";',
    ) &&
    searchBlock.includes(
      "query.cursor = cursor;",
    ) &&
    searchBlock.includes(
      "limit: PAGE_LIMIT",
    ),
  "paged catalog query construction retained",
);

console.log(
  "[ROUND 2] actual request cancellation",
);

must(
  worker.includes(
    "signal?: AbortSignal",
  ),
  "AdminPlus read path accepts AbortSignal",
);

must(
  searchBlock.includes(
    "new AbortController()",
  ),
  "catalog page creates AbortController",
);

must(
  searchBlock.includes(
    "() => controller.abort()",
  ),
  "timeout aborts real HTTP request",
);

must(
  searchBlock.includes(
    "controller.signal",
  ),
  "AbortSignal is passed to catalog GET",
);

must(
  !searchBlock.includes(
    "Promise.race([",
  ),
  "catalog timeout no longer leaves Promise.race request running",
);

console.log(
  "[ROUND 3] R5.9.8 behavior retained",
);

must(
  searchBlock.includes(
    "matches.push(product);",
  ),
  "page matches remain preserved",
);

must(
  /partial\s*=\s*scanned\s*>\s*0\s*\|\|\s*matches\.length\s*>\s*0\s*;/s.test(
    searchBlock,
  ),
  "partial results remain preserved on timeout",
);

must(
  searchBlock.includes(
    "catalogComplete",
  ) &&
    searchBlock.includes(
      "adminplusCatalogCacheSet(",
    ),
  "complete-only cache logic remains",
);

must(
  worker.includes(
    'adminplusGlobalSearchPartialRevision: "v259-r5-9-8-adminplus-global-search-partial-page-20260930"',
  ),
  "R5.9.8 revision retained",
);

console.log(
  "[ROUND 4] payment and release safety",
);

must(
  worker.includes(
    "adminplusReadWithRetry(",
  ),
  "R5.9.7 safe GET retry retained",
);

must(
  worker.includes(
    'adminplusGlobalSearchTimeoutRevision: "v259-r5-9-9-adminplus-search-adaptive-timeout-20260930"',
  ),
  "R5.9.9 health revision exposed",
);

must(
  pkg.scripts["verify:v259r5.9.9"] ===
    "node scripts/verify_r5_9_9_adminplus_global_search_timeout.mjs",
  "R5.9.9 verifier registered",
);

must(
  String(pkg.scripts["verify:all"] || "")
    .includes(
      "verify:v259r5.9.9",
    ),
  "verify:all includes R5.9.9",
);

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(
  "[PASS] R5.9.9 AdminPlus adaptive timeout verification completed.",
);
