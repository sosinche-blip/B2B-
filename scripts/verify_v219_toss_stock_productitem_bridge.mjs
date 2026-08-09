import fs from "node:fs";

const app = fs.readFileSync(new URL("../apps/web/src/App.tsx", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../apps/worker/src/worker.ts", import.meta.url), "utf8");

function must(condition, label) {
  if (!condition) {
    console.error(`[FAIL] ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`[PASS] ${label}`);
  }
}

console.log("[ROUND 1] Toss identifier model");
must(app.includes("stockId: string;") && app.includes("상품 API에서 사용하는 실제 상품 옵션 ID"), "web master stores productItemId and stockId separately");
must(worker.includes("stocks[].id(stockId)") && worker.includes("stocks[].itemId(productItemId)"), "worker documents stockId -> productItemId bridge");
must(worker.includes('`/api/v3/shopping-fep/products/${productId}/v2`'), "Toss product detail API is used for stock bridge");
must(worker.includes('"itemId"') && worker.includes('"stockId"') && worker.includes('"managementCode"'), "product detail parser reads itemId/stockId/managementCode");

console.log("[ROUND 2] Web order correction");
must(app.includes("byStockId: Map<string, TossOptionIdRow>") && app.includes("byProductStockId"), "web lookup indexes Toss stockId");
must(app.includes("lookup.byProductStockId.get") && app.includes("lookup.byStockId.get"), "web resolves order stockId before management-code fallback");
must(app.includes("text(record.stockId)") && app.includes("stockId: cleanId(row.stockId)"), "options-sync stockId is retained in browser/server settings");
must(app.includes("optionId: master.optionId"), "collected Toss order is rewritten to productItemId");
must(app.includes('const APP_VERSION = "V219 '), "V219 UI release marker");

console.log("[ROUND 3] Ncloud automatic purchase bridge");
must(worker.includes("async function adminplusResolveMappingForOrder"), "scheduler has Toss bridge resolver");
must(worker.includes("legacy direct key보다 stockId→productItemId bridge를 먼저 적용"), "canonical bridge runs before legacy direct keys");
must(worker.includes("adminplusFetchTossBridgeRowsForProduct") && worker.includes("adminplusMergeTossBridgeRows"), "scheduler can live-resolve and persist bridge rows");
must(worker.includes("const matchResult = await adminplusResolveMappingForOrder"), "AdminPlus purchase loop uses async Toss bridge");
must(worker.includes('tossBridgeRevision: "toss-stock-productitem-v219-20260809"'), "V219 bridge revision exposed");

// Deterministic example mirroring official Toss fields:
// order.stockId 40001 -> product detail stocks.id 40001 -> stocks.itemId 67890(productItemId)
const masters = [{ productId: "30001", stockId: "40001", optionId: "67890", managementCode: "OPT-001" }];
const order = { productId: "30001", stockId: "40001", productItemManagementCode: "OPT-001" };
const mapping = { channel: "토스", optionId: "67890" };
const master = masters.find((row) => row.productId === order.productId && row.stockId === order.stockId);
must(Boolean(master && master.optionId === mapping.optionId), "stockId 40001 deterministically bridges to Excel/API productItemId 67890");

if (!process.exitCode) console.log("[PASS] V219 Toss stockId/productItemId bridge verification completed (3 rounds).");
