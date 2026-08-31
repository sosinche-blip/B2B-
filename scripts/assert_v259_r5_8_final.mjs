import fs from "node:fs";

const worker =
  fs.readFileSync(
    "apps/worker/src/worker.ts",
    "utf8"
  );

const checks = {
  r58:
    worker.includes(
      "v259-r5-8-system-stability-hardening-20260831"
    ),

  sameIdentity:
    worker.includes(
      "if (sameIdentity) return true;"
    ),

  oldSameVendor:
    worker.includes(
      "if (sameVendor) return true;"
    ),

  health:
    worker.includes(
      'systemStabilityHardeningRevision: "v259-r5-8-system-stability-hardening-20260831"'
    ),

  oldVersion:
    worker.includes(
      'version: "v259-r5-5-system-stability",'
    ),

  newVersion:
    worker.includes(
      'version: "v259-r5-8-system-stability-hardening",'
    ),

  productCode:
    worker.includes(
      "mappingCode === linkCode"
    ),

  productName:
    worker.includes(
      "mappingProduct === linkProduct"
    ),
};

console.log(checks);

const ok =
  checks.r58 &&
  checks.sameIdentity &&
  !checks.oldSameVendor &&
  checks.health &&
  !checks.oldVersion &&
  checks.newVersion &&
  checks.productCode &&
  checks.productName;

if (!ok) {
  throw new Error(
    "R5.8 final source assertion failed"
  );
}

console.log(
  "[PASS] R5.8 final source assertion"
);