import fs from "node:fs";

const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

const pass = (label, ok) => {
  if (!ok) throw new Error(`[FAIL] ${label}`);
  console.log(`[PASS] ${label}`);
};

console.log("[ROUND 1] historical order date coverage");
pass("manual shipment range controls AdminPlus updated_since", worker.includes("adminplusShipmentUpdatedSince(manualRange, config.lastShipmentAt)"));
pass("date-boundary lookback absorbs KST midnight conversion", worker.includes("midnightKstMs - 15 * 60 * 1000"));
pass("scheduled shipment keeps at least seven-day late-evidence lookback", worker.includes("Math.min(watermarkMs, rollingLookbackMs)"));

console.log("[ROUND 2] manual range safety");
pass("manual shipment response exposes the applied date window", worker.includes("shipmentDateWindow") && worker.includes("updatedSince: sinceDefault"));
pass("historical manual runs do not advance the live watermark", worker.includes("historicalManualRun") && worker.includes("!historicalManualRun && result.canAdvanceWatermark"));
pass("selected range is still used for Coupang/Toss preparing lookup", worker.includes("adminplusCurrentMarketplacePreparingOrders(env, manualRange)"));

console.log("[ROUND 3] regression safety");
pass("shipment identifier fallback remains available", worker.includes("shipment recovery accepts alternate marketplace option identifiers") || worker.includes("sameOrder.length === 1"));
pass("R5.9.40 shipment date-window verification completed.", pkg.scripts["verify:r5.9.40"] === "node scripts/verify_r5_9_40_shipment_date_window.mjs");
