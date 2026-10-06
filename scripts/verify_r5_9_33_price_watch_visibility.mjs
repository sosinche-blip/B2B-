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

console.log("[ROUND 1] duplicate navigation removal");
must(!app.includes('>가격감시</button>'), "duplicate 가격감시 tab is removed");
must(!app.includes('"priceWatch"'), "duplicate price watch workspace view is removed");
must(app.includes(">API 상품매칭</button>"), "API 상품매칭 remains the single entry point");

console.log("[ROUND 2] existing watch panel/data retained");
must(
  app.includes("mappingWorkspaceView === \"adminplus\""),
  "existing AdminPlus watch workspace remains available",
);
must(app.includes("checkAdminPlusPricesNow()"), "manual price check remains connected");
must(app.includes("openAdminPlusPriceAlerts"), "price/stock alerts remain connected");
must(app.includes("saveAdminPlusAutomationSettings()"), "watch settings save remains connected");

if (!process.exitCode) {
  console.log("[PASS] R5.9.33 price watch visibility verification completed.");
}
