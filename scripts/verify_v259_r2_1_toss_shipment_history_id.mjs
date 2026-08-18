import fs from "node:fs";

const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");

function must(value, message) {
  if (!value) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`[PASS] ${message}`);
}

console.log("[ROUND 1] Toss marketplace preparing history identifier");

must(
  worker.includes("function adminplusMarketplacePreparingHistoryOptionId(hist: AdminPlusPurchaseHistoryRow)"),
  "channel-aware history identifier helper exists"
);

must(
  worker.includes('String(hist.channel || "").trim() === "토스"'),
  "Toss-specific branch exists"
);

must(
  worker.includes('String(hist.vendorItemId || hist.optionId || "").trim()'),
  "Toss prefers live stockId/vendorItemId"
);

must(
  worker.includes('String(hist.optionId || hist.vendorItemId || "").trim()'),
  "Coupang retains optionId-first behavior"
);

console.log("[ROUND 2] shipment matching integration");

const helperUses =
  worker.split("adminplusMarketplacePreparingHistoryOptionId(").length - 1;

must(
  helperUses >= 7,
  `shipment matching uses helper across all history gates (${helperUses})`
);

must(
  !worker.includes(
    "adminplusMarketplacePreparingMatch(marketplacePreparing.rows, hist.channel, hist.orderNo, hist.optionId || hist.vendorItemId)"
  ),
  "legacy Toss-breaking current marketplace history match removed"
);

must(
  !worker.includes(
    "adminplusMarketplacePreparingMatch(marketplacePreparingRows, hist.channel, hist.orderNo, hist.optionId || hist.vendorItemId)"
  ),
  "legacy recovery history match removed"
);

console.log("[ROUND 3] R2 regressions");

must(
  worker.includes("recoveredMissingTossHistory"),
  "V259 R2 missing-history fallback retained"
);

must(
  worker.includes("manualRange?: { startDate?: string; endDate?: string }"),
  "manual shipment range retained"
);

must(
  worker.includes("adminplusShipmentRun(env, savedPayload, false)"),
  "automatic scheduler call retained"
);

console.log("");
console.log("[PASS] V259 R2.1 Toss shipment history identifier verification completed.");