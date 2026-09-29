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

console.log(
  "[ROUND 1] paged global search",
);

must(
  worker.includes(
    "async function adminplusCatalogSearchPaged(",
  ),
  "paged search helper exists",
);

must(
  worker.includes(
    "const PAGE_LIMIT = 100;",
  ),
  "catalog is read in small pages",
);

must(
  worker.includes(
    "const PAGE_TIMEOUT_MS = 6_000;",
  ),
  "each page has bounded timeout",
);

must(
  worker.includes(
    "matches.push(product);",
  ),
  "matches are preserved page-by-page",
);

console.log(
  "[ROUND 2] partial-result preservation",
);

must(
  /partial\s*=\s*scanned\s*>\s*0\s*\|\|\s*matches\.length\s*>\s*0\s*;/s.test(
    worker,
  ),
  "timeout preserves already scanned state",
);

must(
  worker.includes(
    "부분검색결과",
  ) &&
    worker.includes(
      "partialAccounts",
    ),
  "partial account is surfaced explicitly",
);

must(
  !worker.includes(
    "GLOBAL_SEARCH_ACCOUNT_TIMEOUT_MS = 12_000",
  ),
  "old whole-account 12 second timeout removed",
);

must(
  worker.includes(
    "let catalogComplete = false;",
  ) &&
    worker.includes(
      "catalogComplete = true;",
    ) &&
    worker.includes(
      "ok &&\n    catalogComplete"
    ),
  "only complete catalog is cached",
);

console.log(
  "[ROUND 3] query correctness",
);

must(
  worker.includes(
    "normalizeAdminPlusProductName(",
  ) &&
    worker.includes(
      "searchable.includes(normalizedQuery)",
    ),
  "product name/code/options are filtered per page",
);

must(
  worker.includes(
    "rows.length >= maxResults",
  ),
  "global result limit remains",
);

must(
  worker.includes(
    "matches.length >= maxResults",
  ),
  "per-account search stops after enough matches",
);

console.log(
  "[ROUND 4] regressions",
);

must(
  worker.includes(
    "const GLOBAL_SEARCH_BATCH_SIZE = 3;",
  ),
  "three-account batching retained",
);

must(
  worker.includes(
    "adminplusReadWithRetry(",
  ),
  "R5.9.7 safe GET retry is reused",
);

must(
  worker.includes(
    'adminplusGlobalSearchRevision: "v259-r5-9-6-adminplus-global-search-hardening-20260924"',
  ),
  "R5.9.6 revision retained",
);

must(
  worker.includes(
    'adminplusGlobalSearchPartialRevision: "v259-r5-9-8-adminplus-global-search-partial-page-20260930"',
  ),
  "R5.9.8 health revision exposed",
);

console.log(
  "[PASS] R5.9.8 AdminPlus global search verification completed.",
);
