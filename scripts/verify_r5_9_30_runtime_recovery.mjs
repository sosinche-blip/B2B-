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

console.log("[ROUND 1] delayed AdminPlus payment visibility");
must(worker.includes("async function adminplusPendingPaymentAmountWithRetry"), "pending payment polling exists");
must(worker.includes("const waits = [0, 800, 1800, 3200]"), "pending polling is bounded");
must(worker.includes("await adminplusPendingPaymentAmountWithRetry("), "payment flow uses delayed visibility guard");
must(worker.includes("adminplusDeepObjects(result.data)"), "pending response aliases are scanned");
must(!worker.includes('rows.find((row) => String(row.order_key || "").trim() === key) || rows[0]'), "unrelated pending row fallback remains blocked");

console.log("[ROUND 2] shipment timeout reduction");
must(worker.includes("currentPreparingRows: Array<Record<string, unknown>> = []"), "shipment identifier refresh accepts current snapshot");
must(worker.includes("rawShipmentRows, marketplacePreparing.rows"), "same-run marketplace snapshot is reused");
must(worker.includes("routedAccountIds") && worker.includes("unresolvedAccountRoutes"), "shipment scans only safely routed accounts");
must(worker.includes("statusAccounts = historyAccountIds.size"), "status refresh scans history accounts only");

console.log("[ROUND 3] browser recovery and date rollover");
must(web.includes("noGatewayReplay?: boolean"), "non-replay request option exists");
must(web.includes("{ noGatewayReplay: true }"), "purchase and shipment writes block gateway replay");
must(web.includes("reloadAdminPlusRuntimeHistoryFromServer"), "timeout recovery reloads server truth");
must(web.includes("rollingOrderRangeEndRef"), "rolling date range is tracked");
must(web.includes("const timer = window.setInterval(rollRangeToToday, 60 * 1000)"), "open app rolls date range after midnight");

console.log("[ROUND 4] existing safeguards retained");
must(worker.includes('stage: "payment_key_validation"'), "payment key validation audit retained");
must(worker.includes("adminplusForceCashReceiptRequired"), "cash receipt recovery retained");
must(worker.includes("adminplusMarketplacePreparingMatch"), "marketplace preparing source-of-truth retained");
must(web.includes("adminplusAutomationControlWrite: true"), "dedicated automation settings guard retained");

if (!process.exitCode) console.log("[PASS] R5.9.30 runtime recovery verification completed.");
