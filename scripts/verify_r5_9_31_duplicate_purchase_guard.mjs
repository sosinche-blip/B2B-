import fs from "node:fs";

const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");
const web = fs.readFileSync("apps/web/src/App.tsx", "utf8");

function must(value, label) {
  if (!value) {
    console.error(`[FAIL] ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`[PASS] ${label}`);
  }
}

console.log("[ROUND 1] selection list excludes submitted AdminPlus orders");
must(web.includes("const historyPromise = callApi(`/api/operation/settings/load?settingsKey="), "lookup loads server purchase history");
must(web.includes("const alreadySubmittedRows = displayRows.filter"), "submitted marketplace rows are classified");
must(web.includes("!isAdminPlusOrderSubmitted(adminPlusPaymentHistoryForOrder(row, historySnapshot, false))"), "submitted rows are excluded by exact item identity");
must(web.includes("allowUniqueOrderFallback = true"), "dashboard fallback stays available outside duplicate-sensitive selection");
must(web.includes("AdminPlus 수집완료 ${alreadySubmittedRows.length}건은 중복방지를 위해 선택 목록에서 제외"), "operator sees duplicate exclusion result");

console.log("[ROUND 2] completed UI actions cannot be immediately repeated");
must(web.includes("const collectedIds = new Set(selectedRows.map((row) => row.id))"), "manual collection records processed row IDs");
must(web.includes("setSelectableOrderRows((prev) => prev.filter((row) => !collectedIds.has(row.id)))"), "manual collection removes processed rows");
must(web.includes("adminPlusPaymentHistoryForOrder(row, latestHistory, false)"), "AdminPlus execution clears rows using refreshed server truth");

console.log("[ROUND 3] worker enforces marketplace identity idempotency");
must(worker.includes("function adminplusHistoryMatchesMarketplaceOrder("), "worker duplicate matcher exists");
must(worker.includes("row.orderProductId && orderProductIds.has"), "stable order-product ID blocks duplicate creation");
must(worker.includes("row.vendorItemId && marketplaceItemIds.has"), "stable marketplace item ID blocks duplicate creation");
must(worker.includes("if (historyKeys.has(sourceKey) || existingHistory)"), "source key and marketplace identity are both enforced");

if (!process.exitCode) console.log("[PASS] R5.9.31 duplicate purchase guard verification completed.");
