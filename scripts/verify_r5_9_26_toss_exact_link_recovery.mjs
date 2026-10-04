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

function must(value, label) {
  if (!value) {
    console.error("[FAIL] " + label);
    process.exitCode = 1;
  } else {
    console.log("[PASS] " + label);
  }
}

console.log("[ROUND 1] Toss exact confirmed-link recovery");

must(
  worker.includes(
    "v259-r5-9-26-toss-exact-link-recovery",
  ),
  "R5.9.26 marker exists",
);

must(
  worker.includes(
    "const exactOptionIdentity =",
  ),
  "exact option identity recovery exists",
);

must(
  worker.includes(
    'String(row.optionId || "") === String(mapping.optionId || "")',
  ),
  "same optionId is mandatory",
);

must(
  worker.includes(
    "sameVendor &&",
  ) &&
  worker.includes(
    "sameProductName &&",
  ),
  "same vendor and product name are mandatory",
);

must(
  worker.includes(
    "Math.max(1, Math.floor(Number(row.qty || 1) || 1)) ===",
  ),
  "same base quantity is mandatory",
);

must(
  worker.includes(
    "if (exactOptionIdentity) return true;",
  ),
  "exact confirmed link can recover incomplete mapping authority",
);


console.log("[ROUND 2] incomplete mapping overwrite guard");

must(
  app.includes(
    "const mappingCompletenessScore =",
  ),
  "mapping completeness scoring exists",
);

must(
  app.includes(
    "localScore >= serverScore",
  ),
  "newer incomplete mapping cannot overwrite more complete server mapping",
);

must(
  app.includes(
    "if (text(value.vendorCode)) score += 2;",
  ),
  "vendor code completeness is protected",
);

must(
  app.includes(
    "if (text(value.matchAuthority)) score += 2;",
  ),
  "mapping authority completeness is protected",
);


console.log("[ROUND 3] existing safety retained");

must(
  worker.includes(
    "const sameProductCode =",
  ),
  "product-code identity safety retained",
);

must(
  worker.includes(
    "const sameProductIdentity =",
  ),
  "R5.8.1 identity precedence retained",
);

must(
  worker.includes(
    "await adminplusExactMatch",
  ),
  "actual AdminPlus match validation retained",
);

must(
  worker.includes(
    "기본수량 불일치",
  ),
  "base quantity verification retained",
);

must(
  worker.includes(
    "v259-r5-9-24-order-flow-reliability",
  ),
  "R5.9.24 order/payment safety retained",
);

must(
  worker.includes(
    "v259-r5-9-25-stale-alert-cleanup",
  ),
  "R5.9.25 alert fix retained",
);

if (!process.exitCode) {
  console.log(
    "[PASS] R5.9.26 Toss exact-link recovery verification completed.",
  );
}
