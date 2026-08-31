import fs from "node:fs";

const worker = fs.readFileSync(
  "apps/worker/src/worker.ts",
  "utf8",
);

let failed = 0;

function check(name, condition) {
  if (condition) {
    console.log("[PASS]", name);
  } else {
    console.error("[FAIL]", name);
    failed += 1;
  }
}

function expectedIdentity({
  sameVendor,
  mappingCode,
  linkCode,
  sameProductName,
}) {
  const sameProductCode =
    Boolean(mappingCode) &&
    Boolean(linkCode) &&
    mappingCode === linkCode;

  const hasAnyProductCode =
    Boolean(mappingCode) ||
    Boolean(linkCode);

  const sameProductIdentity =
    hasAnyProductCode
      ? sameProductCode
      : sameProductName;

  return sameVendor && sameProductIdentity;
}

console.log("[ROUND 1] SOURCE POLICY");

check(
  "R5.8.1 marker",
  worker.includes(
    "v259-r5-8-1-product-code-precedence-20260901",
  ),
);

check(
  "product-code presence gate exists",
  worker.includes(
    "const hasAnyProductCode =",
  ),
);

check(
  "product identity uses code precedence",
  worker.includes(
    "const sameProductIdentity =",
  ) &&
  worker.includes(
    "hasAnyProductCode",
  ) &&
  worker.includes(
    "? sameProductCode",
  ) &&
  worker.includes(
    ": sameProductName",
  ),
);

check(
  "old OR fallback removed",
  !worker.includes(
    "(sameProductCode || sameProductName)",
  ),
);

check(
  "sameIdentity still requires same vendor",
  worker.includes(
    "const sameIdentity =",
  ) &&
  worker.includes(
    "sameVendor &&",
  ) &&
  worker.includes(
    "sameProductIdentity",
  ),
);


console.log("[ROUND 2] SEMANTIC CASES");

check(
  "same vendor + code A/A => true",
  expectedIdentity({
    sameVendor: true,
    mappingCode: "A",
    linkCode: "A",
    sameProductName: false,
  }) === true,
);

check(
  "same vendor + code A/B + same name => false",
  expectedIdentity({
    sameVendor: true,
    mappingCode: "A",
    linkCode: "B",
    sameProductName: true,
  }) === false,
);

check(
  "same vendor + code A/blank + same name => false",
  expectedIdentity({
    sameVendor: true,
    mappingCode: "A",
    linkCode: "",
    sameProductName: true,
  }) === false,
);

check(
  "same vendor + blank/blank + same name => true",
  expectedIdentity({
    sameVendor: true,
    mappingCode: "",
    linkCode: "",
    sameProductName: true,
  }) === true,
);

check(
  "different vendor + same code => false",
  expectedIdentity({
    sameVendor: false,
    mappingCode: "A",
    linkCode: "A",
    sameProductName: true,
  }) === false,
);


console.log("[ROUND 3] REGRESSION ANCHORS");

check(
  "R5.8 retained",
  worker.includes(
    "v259-r5-8-system-stability-hardening-20260831",
  ),
);

check(
  "R5.7 retained",
  worker.includes(
    "v259-r5-7-same-vendor-confirmed-link-recovery-20260831",
  ),
);

check(
  "R5.6 tombstone retained",
  worker.includes(
    "v259-r5-6-delete-tombstone-guard-20260828",
  ),
);

check(
  "R4.5 payment retained",
  worker.includes(
    "v259-r4-5-adaptive-adminplus-cash-receipt-20260820",
  ),
);

if (failed) {
  console.error(
    `\n[FAIL] R5.8.1 verifier ${failed} checks failed.`,
  );
  process.exit(1);
}

console.log(
  "\n[PASS] V259 R5.8.1 PRODUCT-CODE PRECEDENCE VERIFIED",
);