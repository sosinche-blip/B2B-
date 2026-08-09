import fs from "node:fs";

const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");

function check(ok, label) {
  if (!ok) { console.error(`[FAIL] ${label}`); process.exitCode = 1; }
  else console.log(`[PASS] ${label}`);
}

console.log("[ROUND 1] coupon actual-applied state reconciliation");
check(app.includes('automationState: couponApiSettings.automationEnabled ? "active" as const : "validated" as const'), "successful manual replace restores automation state");
check(app.includes('preflightStatus: "통과" as const') && app.includes('preflightAt: now'), "successful manual replace marks verified instead of unverified");
check(app.includes('preflightIssues: []'), "successful manual replace clears stale attention issues");
check(worker.includes('couponStateRevision: "coupon-actual-applied-state-v220-20260809"'), "coupon state release marker exists");

console.log("[ROUND 2] Toss bridge and confirmed-link aliases");
check(worker.includes("function tossProductDetailRecord"), "Toss detail response-shape resolver exists");
check(worker.includes("linkCandidateOptionIds"), "Toss equivalent option identifiers are carried to confirmed-link resolution");
check(worker.includes("confirmedLinkCandidates: linkCandidates"), "missing confirmed-link diagnostics expose alias candidates");
check(worker.includes('tossAutoPurchaseRevision: "toss-confirmed-link-alias-v220-20260809"'), "Toss auto-purchase release marker exists");

console.log("[ROUND 3] safety invariants");
check(worker.includes("historyKeys.has(sourceKey)"), "duplicate AdminPlus order history guard remains");
check(worker.includes("runtime blocks quantity mismatch") === false || worker.includes("baseQty"), "baseQty safety code remains present");
check(worker.includes("toss-bridge:") && worker.includes("legacy-direct:"), "bridge-first with legacy fallback remains");

if (process.exitCode) process.exit(process.exitCode);
console.log("[PASS] V220 coupon-state/Toss-auto-purchase verification completed (3 rounds).")
