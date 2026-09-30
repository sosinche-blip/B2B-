import fs from "node:fs";

const worker =
  fs.readFileSync(
    "apps/worker/src/worker.ts",
    "utf8",
  );

const app =
  fs.readFileSync(
    "apps/web/src/App.tsx",
    "utf8",
  );

const pkg =
  JSON.parse(
    fs.readFileSync(
      "package.json",
      "utf8",
    ),
  );

function must(
  condition,
  label,
) {
  if (!condition) {
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
  "[ROUND 1] chunked request architecture",
);

must(
  worker.includes(
    "accountOffset",
  ) &&
  worker.includes(
    "accountLimit",
  ) &&
  worker.includes(
    "totalAccounts",
  ) &&
  worker.includes(
    "hasMoreAccounts",
  ),
  "worker supports account slices",
);

must(
  app.includes(
    "accountLimit: 1",
  ) &&
  app.includes(
    "await Promise.all([",
  ) &&
  app.includes(
    "runSearchWorker(),",
  ),
  "web uses one-account requests with concurrency two",
);

console.log(
  "[ROUND 2] timeout recovery",
);

must(
  worker.includes(
    "} else if (\n        result.timedOut\n      ) {",
  ),
  "any-page timeout can enter slow lane",
);

must(
  worker.includes(
    "const SLOW_PAGE_LIMIT = 200;",
  ) &&
  worker.includes(
    "const SLOW_NEXT_PAGE_TIMEOUT_MS = 25_000;",
  ) &&
  worker.includes(
    "const SLOW_ACCOUNT_BUDGET_MS = 65_000;",
  ),
  "slow lane uses 200-row pages and bounded extended budget",
);

must(
  worker.includes(
    "nextPageTimeoutMs:\n                    10_000",
  ) &&
  worker.includes(
    "accountBudgetMs:\n                    25_000",
  ),
  "single-account normal path gets safer page-two budget",
);

console.log(
  "[ROUND 3] truthful result accounting",
);

must(
  worker.includes(
    "let failedAccounts = 0;",
  ) &&
  worker.includes(
    "partialAccounts === 0",
  ) &&
  worker.includes(
    "failedAccounts === 0",
  ),
  "partial and hard failures are distinct",
);

must(
  app.includes(
    "완전실패",
  ),
  "UI distinguishes hard failures",
);

must(
  worker.includes(
    "const uniqueRows =",
  ),
  "retry results are deduplicated",
);

console.log(
  "[ROUND 4] Cloudflare 524 prevention",
);

must(
  app.includes(
    "accountOffset,",
  ) &&
  app.includes(
    "accountLimit: 1",
  ),
  "browser no longer sends one 15-account search request",
);

must(
  app.includes(
    "검색 중 ·",
  ),
  "progress is displayed as chunks complete",
);

console.log(
  "[ROUND 5] release wiring",
);

const marker =
  'adminplusGlobalSearchChunkRevision: "v259-r5-9-12-adminplus-search-chunked-20260930"';

const markerCount =
  worker.split(
    marker,
  ).length - 1;

must(
  markerCount >= 3,
  "R5.9.12 health marker exposed on all health branches",
);

must(
  worker.includes(
    '"adminplus_global_catalog_search_v259_r5_9_12"',
  ) ||
  worker.includes(
    '"adminplus_global_catalog_search_v259_r5_9_13"',
  ),
  "R5.9.12+ search mode exposed",
);

must(
  Boolean(
    pkg.scripts?.[
      "verify:v259r5.9.12"
    ],
  ),
  "R5.9.12 verifier registered",
);

must(
  String(
    pkg.scripts?.[
      "verify:all"
    ] || "",
  ).includes(
    "verify:v259r5.9.12",
  ),
  "verify:all includes R5.9.12",
);

if (!process.exitCode) {
  console.log(
    "[PASS] R5.9.12 chunked AdminPlus search verification completed.",
  );
}
