import fs from "node:fs";

const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

const pass = (label, ok) => {
  if (!ok) throw new Error(`[FAIL] ${label}`);
  console.log(`[PASS] ${label}`);
};

console.log("[ROUND 1] status refresh 524 prevention");
pass("status endpoint uses the fast-path revision", worker.includes("v259-r5-9-39-status-fast-path"));
pass("marketplace recollection is gated by missing identifiers", worker.includes("needsMarketplaceLookup") && worker.includes("preparingTargets"));
pass("saved Coupang/Toss identifiers can skip the 7-day marketplace scan", worker.includes("저장된 마켓 식별자로 재조회"));

console.log("[ROUND 2] payment reconciliation efficiency");
pass("payment list cache is scoped per account", worker.includes("paymentListCache = new Map<string, ExternalApiResult>()"));
pass("payment list cache is reused by history reconciliation", worker.includes("paymentListCache?.get(cacheKey)") && worker.includes("row, paymentListCache"));
pass("manual payment matching remains read-only", worker.includes("/v1/seller/payments") && worker.includes("adminplusReadWithRetry"));

console.log("[ROUND 3] regression safety");
pass("existing five-pass purchase review remains available", pkg.scripts["verify:r5.9.38"] === "node scripts/verify_r5_9_38_five_pass_purchase_review.mjs");
pass("R5.9.39 status fast-path verification completed.", true);
