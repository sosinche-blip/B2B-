import fs from "node:fs";

const web = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");

function must(value, message) {
  if (!value) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`[PASS] ${message}`);
}

function between(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0) return "";
  return source.slice(a, b);
}

console.log("[ROUND 1] Web marketplace-payment source truth");

const queryBlock = between(
  web,
  'function orderQueryForChannel',
  'function apiDiagnosticsFromResult'
);

must(
  queryBlock.includes("maxPerPage: 50") &&
  queryBlock.includes("maxPages: 10"),
  "Coupang purchase/current query uses explicit 50x10 paging"
);

must(
  queryBlock.includes("maxPages: 20"),
  "Toss query uses explicit maxPages 20"
);

const overviewBlock = between(
  web,
  "async function refreshApiOverview",
  "async function previewSelectablePaymentOrders"
);

must(
  overviewBlock.includes("grouped.payment = marketplacePaidRows;"),
  "daily payment count uses full marketplace ACCEPT/PAID rows"
);

must(
  !overviewBlock.includes(
    "grouped.payment = marketplacePaidRows.filter((row) => !grouped.collected.some"
  ),
  "AdminPlus collected rows are no longer subtracted from marketplace payment count"
);

console.log("[ROUND 2] AdminPlus soldout purchase safety");

const purchaseBlock = between(
  worker,
  "async function adminplusPurchaseRun",
  "async function adminplusShipmentRun"
);

must(
  purchaseBlock.includes("const availabilityBlocked: Array<Record<string, unknown>> = [];"),
  "availability-blocked preflight rows exist"
);

must(
  purchaseBlock.includes('String(confirmedLink?.priceStatus || "").trim()'),
  "purchase flow reads current confirmed AdminPlus product status"
);

must(
  purchaseBlock.includes('availabilityStatus === "품절"'),
  "soldout status is explicitly blocked"
);

must(
  purchaseBlock.includes("AdminPlus 상품 품절 · 주문등록·자동결제 불가"),
  "soldout operator reason is explicit"
);

must(
  purchaseBlock.includes('availabilityStatus === "확인필요"'),
  "uncertain product state is conservatively held"
);

must(
  purchaseBlock.includes("...availabilityBlocked,"),
  "blocked products remain visible in purchase preflight"
);

const guardPos = purchaseBlock.indexOf('availabilityStatus === "품절"');
const candidatePushPos = purchaseBlock.indexOf("candidates.push(");

must(
  guardPos >= 0 && candidatePushPos >= 0 && guardPos < candidatePushPos,
  "availability guard executes before actual purchase candidate insertion"
);

console.log("[ROUND 3] Existing safety regressions");

must(
  worker.includes("function adminplusProductAvailabilityLabel"),
  "existing availability classifier retained"
);

must(
  worker.includes("priceWatchActiveFirstRevision"),
  "active-first false-soldout guard retained"
);

must(
  worker.includes("adminplusMarketplacePreparingHistoryOptionId"),
  "V259 R2.1 Toss shipment identifier fix retained"
);

must(
  worker.includes("adminplusShipmentRun(env, savedPayload, false)"),
  "automatic shipment scheduler retained"
);

console.log("");
console.log("[PASS] V259 R3 payment count + soldout purchase guard verification completed.");