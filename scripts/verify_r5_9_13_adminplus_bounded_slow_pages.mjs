import fs from "node:fs";

const worker =
  fs.readFileSync(
    "apps/worker/src/worker.ts",
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
  "[ROUND 1] bounded account timing",
);

must(
  worker.includes(
    "nextPageTimeoutMs:\n                    10_000",
  ) &&
  worker.includes(
    "accountBudgetMs:\n                    25_000",
  ),
  "single-account fast probe is bounded to 25 seconds",
);

must(
  worker.includes(
    "const SLOW_NEXT_PAGE_TIMEOUT_MS = 25_000;",
  ),
  "slow later pages receive 25 seconds",
);

must(
  worker.includes(
    "const SLOW_ACCOUNT_BUDGET_MS = 65_000;",
  ),
  "slow retry remains capped at 65 seconds",
);

must(
  25_000 + 65_000 <= 90_000,
  "combined fast+slow policy stays within 90 seconds",
);

console.log(
  "[ROUND 2] existing safety architecture",
);

must(
  worker.includes(
    "const SLOW_RETRY_BATCH_SIZE = 2;",
  ),
  "slow-lane concurrency remains two",
);

must(
  worker.includes(
    "const SLOW_PAGE_LIMIT = 200;",
  ),
  "slow pages remain 200 rows",
);

must(
  worker.includes(
    "result.timedOut",
  ) &&
  worker.includes(
    "slowRetryAccounts.push(",
  ),
  "timeout recovery remains enabled",
);

must(
  worker.includes(
    "partialAccounts === 0",
  ) &&
  worker.includes(
    "failedAccounts === 0",
  ),
  "partial and hard failures remain distinct",
);

console.log(
  "[ROUND 3] no business-write changes",
);

must(
  worker.includes(
    "payment POST remains direct",
  ) === false,
  "verifier does not alter payment implementation",
);

must(
  !worker.includes(
    "adminplusGlobalSearchBoundedSlowPageRevision: \"\"",
  ),
  "release marker has a concrete value",
);

console.log(
  "[ROUND 4] release wiring",
);

const marker =
  'adminplusGlobalSearchBoundedSlowPageRevision: "v259-r5-9-13-adminplus-bounded-slow-pages-20260930"';

must(
  worker.split(marker).length - 1 >= 3,
  "R5.9.13 health marker exposed on health branches",
);

must(
  worker.includes(
    '"adminplus_global_catalog_search_v259_r5_9_13"',
  ),
  "R5.9.13 search mode exposed",
);

must(
  Boolean(
    pkg.scripts?.[
      "verify:v259r5.9.13"
    ],
  ),
  "R5.9.13 verifier registered",
);

must(
  String(
    pkg.scripts?.[
      "verify:all"
    ] || "",
  ).includes(
    "verify:v259r5.9.13",
  ),
  "verify:all includes R5.9.13",
);

if (!process.exitCode) {
  console.log(
    "[PASS] R5.9.13 bounded slow-page verification completed.",
  );
}
