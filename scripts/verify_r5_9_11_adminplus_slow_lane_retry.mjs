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
  "[ROUND 1] default path preserved",
);

must(
  worker.includes(
    "const PAGE_LIMIT = 500;",
  ) &&
  worker.includes(
    "const FIRST_PAGE_TIMEOUT_MS = 15_000;",
  ) &&
  worker.includes(
    "const GLOBAL_SEARCH_BATCH_SIZE = 2;",
  ),
  "R5.9.10 normal search policy retained",
);

console.log(
  "[ROUND 2] slow-lane eligibility",
);

must(
  worker.includes(
    "result.timedOut",
  ) &&
  worker.includes(
    "slowRetryAccounts.push(",
  ),
  "timeout slow-lane recovery retained",
);

must(
  worker.includes(
    "const SLOW_FIRST_PAGE_LIMIT = 200;",
  ),
  "slow retry starts with smaller 200-row first page",
);

must(
  worker.includes(
    "const SLOW_FIRST_PAGE_TIMEOUT_MS = 30_000;",
  ),
  "slow retry gives first page 30 seconds",
);

must(
  worker.includes(
    "const SLOW_ACCOUNT_BUDGET_MS = 60_000;",
  ),
  "slow retry receives bounded extended account budget",
);

console.log(
  "[ROUND 3] bounded retry concurrency",
);

must(
  worker.includes(
    "const SLOW_RETRY_BATCH_SIZE = 2;",
  ) &&
  worker.includes(
    "Promise.allSettled(",
  ),
  "slow retries remain bounded to two accounts",
);

console.log(
  "[ROUND 4] observability",
);

must(
  worker.includes(
    "recoveredAccounts",
  ) &&
  worker.includes(
    "slowRetryAccounts:",
  ),
  "response exposes recovery counters",
);

must(
  worker.includes(
    "느린업체 재시도복구",
  ),
  "operator message reports recovered accounts",
);

must(
  worker.includes(
    'adminplusGlobalSearchSlowLaneRevision: "v259-r5-9-11-adminplus-search-slow-lane-20260930"',
  ),
  "R5.9.11 health revision exposed",
);

console.log(
  "[ROUND 5] release wiring",
);

must(
  Boolean(
    pkg.scripts?.[
      "verify:v259r5.9.11"
    ],
  ),
  "R5.9.11 verifier registered",
);

must(
  String(
    pkg.scripts?.[
      "verify:all"
    ] || "",
  ).includes(
    "verify:v259r5.9.11",
  ),
  "verify:all includes R5.9.11",
);

if (!process.exitCode) {
  console.log(
    "[PASS] R5.9.11 slow-lane retry verification completed.",
  );
}
