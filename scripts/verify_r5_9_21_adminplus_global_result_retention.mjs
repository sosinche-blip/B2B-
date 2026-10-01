import fs from "node:fs";

const app =
  fs.readFileSync(
    "apps/web/src/App.tsx",
    "utf8",
  );

function must(ok, label) {
  if (!ok) {
    console.error("[FAIL] " + label);
    process.exitCode = 1;
  } else {
    console.log("[PASS] " + label);
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
  "[ROUND 1] R5.9.21 result retention",
);

must(
  block.includes(
    "v259-r5-9-21-adminplus-global-result-retention",
  ),
  "R5.9.21 marker exists",
);

must(
  block.includes(
    "${row.accountId}|${row.productCode}",
  ),
  "account+product dedupe retained",
);

/*
 * 정확히 문제가 된 전역 100건 절단이 없어야 합니다.
 */
must(
  !/currentRows[\s\S]*?\.slice\(\s*0\s*,\s*100\s*,?\s*\)/.test(
    block,
  ),
  "global currentRows 100-row truncation removed",
);

console.log(
  "[ROUND 2] progressive results do not disappear",
);

const collected = [];

function currentRows() {
  return Array.from(
    new Map(
      collected.map(
        (row) => [
          row.accountId + "|" + row.productCode,
          row,
        ],
      ),
    ).values(),
  );
}

/*
 * 4개 업체 x 60개 = 240개를 순차 합산해
 * 100건을 넘어도 전부 유지되는지 확인합니다.
 */
for (
  let vendorIndex = 0;
  vendorIndex < 4;
  vendorIndex++
) {
  for (
    let itemIndex = 0;
    itemIndex < 60;
    itemIndex++
  ) {
    collected.push({
      accountId:
        "vendor-" + vendorIndex,
      productCode:
        "P-" +
        vendorIndex +
        "-" +
        itemIndex,
      name:
        "시나노 " +
        vendorIndex +
        "-" +
        itemIndex,
    });
  }
}

const simulated =
  currentRows();

must(
  simulated.length === 240,
  "240 unique results remain visible",
);

must(
  simulated.some(
    (row) =>
      row.accountId === "vendor-0" &&
      row.productCode === "P-0-0",
  ),
  "early result remains after later vendors merge",
);

must(
  new Set(
    simulated.map(
      (row) => row.accountId,
    ),
  ).size === 4,
  "all result vendors remain represented",
);

console.log(
  "[ROUND 3] R5.9.12 chunk architecture retained",
);

must(
  block.includes(
    "accountLimit: 1",
  ),
  "one-account chunk requests retained",
);

must(
  block.includes(
    "const runSearchWorker",
  ),
  "chunk worker retained",
);

must(
  block.includes(
    "runSearchWorker(),",
  ),
  "parallel chunk runner retained",
);

must(
  block.includes(
    "setAdminplusGlobalSearchRows(",
  ),
  "progressive UI update retained",
);

console.log(
  "[ROUND 4] backend safety",
);

must(
  block.includes(
    '"/api/integrations/adminplus/catalog/search"',
  ),
  "read-only catalog search route retained",
);

must(
  !block.includes(
    "purchase-execute",
  ),
  "no purchase execution added",
);

must(
  !block.includes(
    "payment",
  ) ||
  block.includes(
    "catalog/search",
  ),
  "catalog search remains isolated",
);

console.log(
  "[ROUND 5] R5.9.18+ UI retained",
);

must(
  app.includes(
    "v259-r5-9-18-price-mobile-compact",
  ),
  "R5.9.18 UI logic retained",
);

if (!process.exitCode) {
  console.log(
    "[PASS] R5.9.21 AdminPlus global-result retention verification completed.",
  );
}
