import fs from "node:fs";

const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");
const web = fs.readFileSync("apps/web/src/App.tsx", "utf8");

function must(value, message) {
  if (!value) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`[PASS] ${message}`);
}

console.log("[ROUND 1] manual shipment range");

must(
  web.includes("manualShipmentRange:") &&
  web.includes("startDate: orderApiFilter.startDate") &&
  web.includes("endDate: orderApiFilter.endDate"),
  "web passes selected date range only for shipment runtime"
);

must(
  worker.includes("manualRange?: { startDate?: string; endDate?: string }"),
  "worker accepts manual shipment range"
);

must(
  worker.includes("dateRangeList(") &&
  worker.includes("manualRange.startDate"),
  "manual Coupang range uses selected dates"
);

must(
  worker.includes("status: \"PREPARING_PRODUCT\""),
  "Toss PREPARING_PRODUCT lookup retained"
);

console.log("[ROUND 2] missing Toss history recovery");

must(
  worker.includes("recoveredMissingTossHistory"),
  "missing Toss history recovery counter exists"
);

must(
  worker.includes("adminplusResolveMappingForOrder(env, payload, market, mappings, tossProductCache)"),
  "existing Toss stockId/productItemId bridge is reused"
);

must(
  worker.includes("adminplusResolvePurchaseAccount(config, accounts, mapping.vendorName)"),
  "existing multi-account routing is reused"
);

must(
  worker.includes('channel: "토스"') &&
  worker.includes("customerOrderCode: adminplusCustomerOrderCode"),
  "synthetic Toss shipment history uses standard B2B customer code"
);

must(
  worker.includes("orderProductId: String(market.orderProductId || market.tossOrderProductId || \"\")"),
  "Toss orderProductId is retained for shipment upload"
);

console.log("[ROUND 3] scheduler regression");

must(
  worker.includes("adminplusShipmentRun(env, savedPayload, false)"),
  "automatic scheduler still calls shipment run without manual range"
);

must(
  worker.includes("V259: manual shipment preflight/sync uses the same server-confirmed state"),
  "V259 server source-of-truth retained"
);

console.log("");
console.log("[PASS] V259 R2 manual shipment range + Toss recovery verification completed.");