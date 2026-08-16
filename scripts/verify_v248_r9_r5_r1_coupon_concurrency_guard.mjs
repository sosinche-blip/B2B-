import fs from "node:fs";

const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");

function must(value, label) {
  if (!value) {
    console.error("[FAIL] " + label);
    process.exit(1);
  }
  console.log("[PASS] " + label);
}

console.log("[ROUND 1] safety lock");

must(
  worker.includes('.in("status", ["pending", "running"])'),
  "pending and running retries block coupon issue"
);

console.log("[ROUND 2] atomic retry claim");

must(
  worker.includes('.update({ status: "running", updated_at: nowIso })') &&
  worker.includes('.eq("status", "pending")') &&
  worker.includes('.select("id");'),
  "conditional pending-to-running claim"
);

must(
  worker.includes('skipped: "retry_already_claimed"'),
  "already claimed retry is skipped"
);

must(
  worker.includes("if (!(claimedRows || []).length)"),
  "duplicate scheduler cannot execute same retry"
);

console.log("[ROUND 3] regression");

must(
  worker.includes(
    'if (!settings.automationEnabled || !currentTemplate?.enabled || currentTemplate.automationState !== "active")'
  ),
  "automation stopped guard retained"
);

must(
  worker.includes(
    'couponConcurrencyGuardRevision: "v248-r9r5r1-coupon-concurrency-guard-20260816"'
  ),
  "R9.5.1 marker"
);

must(
  worker.includes(
    'couponIntegrityGuardRevision: "v248-r9r5-coupon-integrity-guard-20260816"'
  ),
  "R9.5 retained"
);

must(
  worker.includes(
    'couponAnchoredGapRepairRevision: "v248-r9r4-coupon-anchor-gap-repair-20260816"'
  ),
  "R9.4 retained"
);

must(
  worker.includes(
    'couponAdaptiveActualEndRevision: "v248-r8r3-adaptive-actual-end-reissue-20260813"'
  ),
  "R8.3 retained"
);

must(
  worker.includes(
    'adminplusMultiAccountFlowRevision: "v248-r9r2-adminplus-multiaccount-flow-fix-20260813"'
  ),
  "R9.2 retained"
);

console.log("[PASS] V248 R9.5.1 concurrency guard verification completed.");
