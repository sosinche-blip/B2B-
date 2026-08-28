import fs from "node:fs";

const w = fs.readFileSync("apps/worker/src/worker.ts", "utf8");
const a = fs.readFileSync("apps/web/src/App.tsx", "utf8");

const authStart = w.indexOf("const apiLinkHasAuthority =");
const authEnd = w.indexOf("let confirmedLink:", authStart);
const auth = w.slice(authStart, authEnd);

const priceStart = w.indexOf("const previousCurrent =");
const priceEnd = w.indexOf("for (const row of unresolvedAccountLinks)", priceStart);
const price = w.slice(priceStart, priceEnd);

const checks = [
  ["R5.3.3 marker", w.includes("v259-r5-3-3-confirmed-link-recovery-20260828")],
  ["R5.4 marker", w.includes("v259-r5-4-price-final-change-time-20260828")],
  [
    "API confirmed link precedes Excel rejection",
    auth.indexOf('if (linkAuthority === "api") return true;') >= 0 &&
    auth.indexOf('if (linkAuthority === "api") return true;') <
    auth.indexOf('if (mappingAuthority === "excel") return false;')
  ],
  ["actualPriceChanged exists", price.includes("const actualPriceChanged =")],
  ["previousCurrent comparison retained", price.includes("previousCurrent !== product.price")],
  ["baseline retained", price.includes("link.baselinePrice = baseline;")],
  ["current retained", price.includes("link.currentPrice = product.price;")],
  ["price alert kind", price.includes('alertKind: "가격변동"')],
  [
    "final price change timestamp",
    price.includes('detectedAt: String(link.priceChangedAt || "").trim() || now')
  ],
  [
    "same price alert preserved",
    w.includes('return !kind || kind === "가격변동";')
  ],
  [
    "UI final change time",
    a.includes('"최종변경시각","상태","업체"')
  ],
];

let failed = 0;

for (const [name, ok] of checks) {
  if (ok) console.log("[PASS]", name);
  else {
    console.error("[FAIL]", name);
    failed++;
  }
}

if (failed) process.exit(1);

console.log("\n[PASS] V259 R5.3.3 + R5.4 verification completed.");
