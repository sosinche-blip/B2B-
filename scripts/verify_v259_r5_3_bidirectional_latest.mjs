import fs from "node:fs";

const app = fs.readFileSync(
  "apps/web/src/App.tsx",
  "utf8",
);

const checks = [
  [
    "R5.3 marker",
    app.includes(
      "v259-r5-3-safe-bidirectional-latest-confirmed-20260827",
    ),
  ],
  [
    "latest confirmed time wins",
    app.includes(
      "if (linkTime > mappingTime) apiWins = true;",
    ) &&
    app.includes(
      "else if (mappingTime > linkTime) apiWins = false;",
    ),
  ],
  [
    "stale confirmed API link blocked",
    app.includes(
      "if (mappingTime > linkTime) return false;",
    ),
  ],
  [
    "mapping to API sync helper",
    app.includes(
      "function syncAdminPlusLinksFromLatestMappings(",
    ),
  ],
  [
    "mapping display overwrites API display",
    app.includes(
      "vendorName: mapping.vendorName",
    ) &&
    app.includes(
      "text(mapping.vendorProductName)",
    ),
  ],
  [
    "stale product identity cleared",
    app.includes(
      "sameVendor && sameProduct",
    ) &&
    app.includes(
      '? link.productCode' +
      "\n            : \"\"",
    ),
  ],
  [
    "excel winner stamped",
    app.includes(
      'matchAuthority: "excel" as const',
    ),
  ],
  [
    "API confirmation retained",
    app.includes(
      'matchAuthority: "api" as const',
    ) &&
    app.includes(
      "vendorCode: selected.productCode || mapping.vendorCode",
    ),
  ],
  [
    "autosave persists latest API links",
    app.includes(
      "latestLinkSync.changed",
    ) &&
    app.includes(
      "latestLinkSync.rows",
    ),
  ],
  [
    "old record-only message removed",
    !app.includes(
      "기존 API상품매칭은 기록만 유지하며 자동발주에는 사용하지 않습니다.",
    ),
  ],
];

let failures = 0;

for (const [name, ok] of checks) {
  console.log(ok ? "[PASS]" : "[FAIL]", name);
  if (!ok) failures += 1;
}

if (failures) {
  console.error(
    "\nR5.3 verifier failures:",
    failures,
  );
  process.exit(1);
}

console.log(
  "\n[PASS] V259 R5.3 bidirectional latest-confirmed verification completed.",
);
