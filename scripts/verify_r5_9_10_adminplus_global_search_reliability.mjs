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

function must(condition, label) {
  if (!condition) {
    console.error("[FAIL] " + label);
    process.exitCode = 1;
  } else {
    console.log("[PASS] " + label);
  }
}

console.log(
  "[ROUND 1] request efficiency",
);

must(
  worker.includes(
    "const PAGE_LIMIT = 500;",
  ),
  "global catalog uses bounded 500-row pages",
);

must(
  worker.includes(
    "const GLOBAL_SEARCH_BATCH_SIZE = 2;",
  ),
  "global search concurrency reduced to two accounts",
);

console.log(
  "[ROUND 2] completeness correctness",
);

must(
  worker.includes(
    "const seenCursors = new Set<string>();",
  ),
  "paged search detects repeated cursors",
);

must(
  worker.includes(
    "resultLimitReached",
  ) &&
  worker.includes(
    "catalogComplete",
  ),
  "search completion distinguishes natural end from result cap",
);

must(
  worker.includes(
    "searchComplete",
  ) &&
  worker.includes(
    "confirmedZero",
  ),
  "global response exposes reliable completion state",
);

console.log(
  "[ROUND 3] UI truth",
);

must(
  app.includes(
    "adminplusGlobalSearchComplete",
  ),
  "web tracks global search completeness",
);

must(
  app.includes(
    "검색결과 0건을 확정할 수 없습니다",
  ),
  "incomplete search no longer claims product absence",
);

must(
  app.includes(
    "조건에 맞는 상품이 없습니다",
  ),
  "true completed zero-result state remains clear",
);

console.log(
  "[ROUND 4] release safety",
);

must(
  worker.includes(
    'adminplusGlobalSearchReliabilityRevision: "v259-r5-9-10-adminplus-search-reliability-20260930"',
  ),
  "R5.9.10 health revision exposed",
);

must(
  Boolean(
    pkg.scripts?.["verify:v259r5.9.10"],
  ),
  "R5.9.10 verifier registered",
);

must(
  String(
    pkg.scripts?.["verify:all"] || "",
  ).includes(
    "verify:v259r5.9.10",
  ),
  "verify:all includes R5.9.10",
);

if (!process.exitCode) {
  console.log(
    "[PASS] R5.9.10 global search reliability verification completed.",
  );
}
