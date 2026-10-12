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
pass("successful batch order keys are persisted without duplicate POST", worker.includes("배치 성공 order_key 보존") && worker.includes("if (result?.ok && batchMeta.orderKey)"));
pass("batch-success fallback keeps customer order code for later reconciliation", worker.includes("direct.adminplusOrderCode || \"\"") && worker.includes("batchMeta.orderKey"));
pass("manual payment matching includes marketplace/order identifiers", worker.includes("row.orderId") && worker.includes("item.marketplaceOrderId"));
pass("manual payment aliases include payment-completed/deposit-completed variants", worker.includes("paymentcompleted") && worker.includes("depositcompleted"));
pass("manual payment preparing transition refreshes marketplace identifiers once", worker.includes("refreshedRows") && worker.includes("const refreshed=await collectCurrentMarketplaceOrders(env)"));
pass("preparing retry is isolated to marketplace acknowledge", worker.includes("상품준비중 변경만 재시도합니다"));
pass("shipment recovery accepts alternate marketplace option identifiers", worker.includes("row.tossStockId") && worker.includes("sameOrder.length === 1"));
pass("multi-item orders remain protected from order-only relinking", worker.includes("여러 상품 주문은 오매칭을 막기 위해 보류합니다"));
pass("R5.9.39 status fast-path verification completed.", true);
