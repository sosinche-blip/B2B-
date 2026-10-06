import fs from "node:fs";

const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");

function must(ok, label) {
  if (!ok) {
    console.error("[FAIL]", label);
    process.exitCode = 1;
  } else {
    console.log("[PASS]", label);
  }
}

console.log("[ROUND 1] price watch navigation");
must(app.includes('"priceWatch"'), "price watch workspace view exists");
must(app.includes(">가격감시</button>"), "가격감시 tab is visible");
must(app.includes("mappingWorkspaceView === \"priceWatch\""), "가격감시 tab has independent active state");

console.log("[ROUND 2] existing watch panel/data retained");
must(
  app.includes("mappingWorkspaceView === \"adminplus\" || mappingWorkspaceView === \"priceWatch\""),
  "price watch opens the existing AdminPlus watch workspace",
);
must(app.includes("checkAdminPlusPricesNow()"), "manual price check remains connected");
must(app.includes("openAdminPlusPriceAlerts"), "price/stock alerts remain connected");
must(app.includes("saveAdminPlusAutomationSettings()"), "watch settings save remains connected");

if (!process.exitCode) {
  console.log("[PASS] R5.9.33 price watch visibility verification completed.");
}
