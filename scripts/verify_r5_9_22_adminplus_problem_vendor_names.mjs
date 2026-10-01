import fs from "node:fs";

const app =
  fs.readFileSync(
    "apps/web/src/App.tsx",
    "utf8",
  );

function must(ok, label) {
  if (!ok) {
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

const start =
  app.indexOf(
    "async function searchAllAdminPlusProducts(",
  );

const end =
  app.indexOf(
    "function adminPlusGlobalReplacementKey(",
    start,
  );

const block =
  start >= 0 &&
  end > start
    ? app.slice(start, end)
    : "";

console.log(
  "[ROUND 1] R5.9.22 marker",
);

must(
  block.includes(
    "v259-r5-9-22-adminplus-problem-vendor-names",
  ),
  "R5.9.22 marker exists",
);

console.log(
  "[ROUND 2] problem vendor collection",
);

must(
  block.includes(
    "partialVendorNames",
  ),
  "partial vendor set exists",
);

must(
  block.includes(
    "failedVendorNames",
  ),
  "failed vendor set exists",
);

must(
  block.includes(
    "summary?.errors",
  ),
  "server error vendor evidence used",
);

must(
  block.includes(
    "row?.vendorName",
  ),
  "vendorName is preferred from error evidence",
);

must(
  block.includes(
    "partialVendorNames.delete",
  ),
  "failed vendor wins over partial vendor",
);

console.log(
  "[ROUND 3] display format",
);

must(
  block.includes(
    "부분조회 ${partialAccounts}개${vendorSuffix(partialVendorNames)}",
  ),
  "partial vendor names displayed in parentheses",
);

must(
  block.includes(
    "완전실패 ${failedAccounts}개${vendorSuffix(failedVendorNames)}",
  ),
  "failed vendor names displayed in parentheses",
);

console.log(
  "[ROUND 4] R5.9.21 retention",
);

must(
  block.includes(
    "v259-r5-9-21-adminplus-global-result-retention",
  ),
  "R5.9.21 result retention retained",
);

must(
  !/const currentRows\s*=[\s\S]*?\.slice\(\s*0\s*,\s*100/.test(
    block,
  ),
  "global 100-row truncation remains removed",
);

must(
  block.includes(
    "accountLimit: 1",
  ),
  "one-account chunk search retained",
);

must(
  block.includes(
    "runSearchWorker(),",
  ),
  "concurrency-two chunk architecture retained",
);

console.log(
  "[ROUND 5] business-write safety",
);

must(
  block.includes(
    '"/api/integrations/adminplus/catalog/search"',
  ),
  "catalog search route retained",
);

must(
  !block.includes(
    "purchase-execute",
  ),
  "no purchase execution added",
);

must(
  !block.includes(
    "scheduler/tick",
  ),
  "no scheduler tick added",
);

if (!process.exitCode) {
  console.log(
    "[PASS] R5.9.22 problem-vendor display verification completed.",
  );
}
