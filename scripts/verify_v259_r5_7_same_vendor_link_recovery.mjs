import fs from "node:fs";

const worker = fs.readFileSync(
  "apps/worker/src/worker.ts",
  "utf8"
);

const startAnchor =
  "// R5.3.3: surviving server-confirmed API link wins.";

const endAnchor =
  '    const matchString = String(confirmedLink?.matchString || "").trim();';

const start = worker.indexOf(startAnchor);
const end = worker.indexOf(endAnchor, start);

if (start < 0 || end < 0) {
  throw new Error(
    "purchase authority block not found"
  );
}

const block = worker.slice(start, end);

const sameVendorPos =
  block.indexOf("if (sameIdentity) return true;");

const excelRejectPos =
  block.indexOf(
    'if (mappingAuthority === "excel") return false;'
  );

const linkApiPos =
  block.indexOf(
    'if (linkAuthority === "api") return true;'
  );

const mappingApiPos =
  block.indexOf(
    'if (mappingAuthority === "api") return true;'
  );

const checks = [
  [
    "R5.7 marker",
    worker.includes(
      "v259-r5-7-same-vendor-confirmed-link-recovery-20260831"
    ),
  ],
  [
    "server confirmed API authority still wins",
    linkApiPos >= 0,
  ],
  [
    "mapping API authority still wins",
    mappingApiPos >= 0,
  ],
  [
    "same product identity recovery exists",
    sameVendorPos >= 0,
  ],
  [
    "Excel conflict rejection retained",
    excelRejectPos >= 0,
  ],
  [
    "same product identity recovery runs before Excel rejection",
    sameVendorPos >= 0 &&
      excelRejectPos > sameVendorPos,
  ],
  [
    "old Excel-before-identity ordering removed",
    !block.includes(
`if (mappingAuthority === "excel") return false;

      const sameVendor =`
    ),
  ],
  [
    "R5.6 tombstone guard retained",
    worker.includes("!tombstones[id] &&") &&
      worker.includes(
        "!adminplusProductLinkDeletedIds.has(id)"
      ),
  ],
];

let failures = 0;

for (const [name, ok] of checks) {
  if (ok) {
    console.log(`[PASS] ${name}`);
  } else {
    console.error(`[FAIL] ${name}`);
    failures += 1;
  }
}

if (failures > 0) {
  throw new Error(
    `R5.7 verification failed: ${failures}`
  );
}

console.log(
  "\n[PASS] V259 R5.7 same-vendor confirmed-link recovery verified."
);