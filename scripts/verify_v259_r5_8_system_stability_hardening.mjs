import fs from "node:fs";

const worker =
  fs.readFileSync("apps/worker/src/worker.ts", "utf8");

const pkg =
  JSON.parse(fs.readFileSync("package.json", "utf8"));

const wrangler =
  fs.readFileSync("wrangler.toml", "utf8");

let failures = 0;

function pass(name, ok) {
  if (ok) {
    console.log("[PASS] " + name);
    return;
  }

  failures += 1;
  console.error("[FAIL] " + name);
}


/* ROUND 1 */
console.log("");
console.log("[ROUND 1] PURCHASE IDENTITY SAFETY");

pass(
  "R5.8 marker",
  worker.includes(
    "v259-r5-8-system-stability-hardening-20260831"
  )
);

pass(
  "sameVendor-only recovery removed",
  !worker.includes(
    "if (sameVendor) return true;"
  )
);

pass(
  "sameIdentity gate exists",
  worker.includes(
    "if (sameIdentity) return true;"
  )
);

pass(
  "same identity requires same vendor",
  worker.includes(
    "sameVendor &&"
  )
);

pass(
  "same identity requires code or product name",
  worker.includes(
    "(sameProductCode || sameProductName)"
  )
);

pass(
  "product code equality",
  worker.includes(
    "mappingCode === linkCode"
  )
);

pass(
  "blank code cannot match",
  worker.includes("Boolean(mappingCode)") &&
  worker.includes("Boolean(linkCode)")
);

pass(
  "blank product name cannot match",
  worker.includes("Boolean(mappingProduct)") &&
  worker.includes("Boolean(linkProduct)")
);

pass(
  "Excel conflicting identity remains blocked",
  worker.includes(
    'if (mappingAuthority === "excel") return false;'
  )
);


/* ROUND 2 */
console.log("");
console.log("[ROUND 2] DELETE / TOMBSTONE / SERVER TRUTH");

pass(
  "R5.6 tombstone API-link guard",
  worker.includes("!tombstones[id] &&") &&
  worker.includes(
    "!adminplusProductLinkDeletedIds.has(id)"
  )
);

pass(
  "persistent tombstones",
  worker.includes(
    "mappingTombstones: pruneMappingTombstones(tombstones)"
  )
);

pass(
  "purchase server source-of-truth",
  worker.includes(
    'for (const protectedKey of ["mappings", "adminplusProductLinks", "adminplusPurchaseHistory", "tossOptionMaster", "tossOptionBridgeRows"])'
  )
);


/* ROUND 3 */
console.log("");
console.log("[ROUND 3] RELEASE / HEALTH OBSERVABILITY");

pass(
  "R5.8 health revision exposed",
  worker.includes(
    'systemStabilityHardeningRevision: "v259-r5-8-system-stability-hardening-20260831"'
  )
);

pass(
  "old R5.5 release version removed",
  !worker.includes(
    'version: "v259-r5-5-system-stability",'
  )
);

pass(
  "R5.8 release version exposed",
  worker.includes(
    'version: "v259-r5-8-system-stability-hardening",'
  )
);

pass(
  "historical R5.5 stability marker retained",
  worker.includes(
    'systemStabilityRevision: "v259-r5-5-system-stability-20260828"'
  )
);


/* ROUND 4 */
console.log("");
console.log("[ROUND 4] SCHEDULER / INFRASTRUCTURE SAFETY");

pass(
  "fixed production settings key",
  worker.includes(
    'const PRODUCTION_SETTINGS_KEY = "b2b-master-settings";'
  )
);

pass(
  "Cloudflare cron remains absent",
  !/^\s*crons\s*=/m.test(wrangler) &&
  !/\[\[triggers\]\]/m.test(wrangler)
);

pass(
  "scheduler payload source retained",
  worker.includes(
    "loadLatestSchedulerPayload"
  )
);


/* ROUND 5 */
console.log("");
console.log("[ROUND 5] BUSINESS FLOW REGRESSION ANCHORS");

pass(
  "R5.7 verifier registered",
  Boolean(
    pkg.scripts?.["verify:v259r5.7"]
  )
);

pass(
  "purchase preflight retained",
  worker.includes(
    "/api/integrations/adminplus/purchase/preflight"
  )
);

pass(
  "shipment preflight retained",
  worker.includes(
    "/api/integrations/adminplus/shipments/preflight"
  )
);

pass(
  "adaptive payment retained",
  worker.includes(
    "v259-r4-5-adaptive-adminplus-cash-receipt-20260820"
  )
);

pass(
  "R5.6 retained",
  worker.includes(
    "v259-r5-6-delete-tombstone-guard-20260828"
  )
);

pass(
  "R5.7 retained",
  worker.includes(
    "v259-r5-7-same-vendor-confirmed-link-recovery-20260831"
  )
);

console.log("");

if (failures > 0) {
  throw new Error(
    "R5.8 five-round audit failed: " +
      failures
  );
}

console.log(
  "[PASS] V259 R5.8 FIVE-ROUND SYSTEM STABILITY AUDIT COMPLETE"
);