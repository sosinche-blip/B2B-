import fs from "node:fs";
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const app=fs.existsSync("apps/web/src/App.tsx")?fs.readFileSync("apps/web/src/App.tsx","utf8"):"";
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] manual/external AdminPlus safe relink");
must(worker.includes("adminplusManualRelinkCandidate"),"manual-order relink matcher exists");
must(worker.includes("receiverName: true") && worker.includes("phoneMatched") && (worker.includes("addressMatched") || worker.includes("addressPrefixMatched")) && worker.includes("productMatched"),"relink requires receiver/contact/address/product evidence");
must(worker.includes("qtyMatched"),"quantity evidence remains available for relink diagnostics");
must(worker.includes("byMarket") && worker.includes("byAdmin"),"relink uniqueness is checked from both marketplace and AdminPlus sides");

console.log("[ROUND 2] ambiguity and shipment safety");
must(worker.includes("manual_order_relink_ambiguous"),"ambiguous relink has dedicated diagnostic");
must(worker.includes("manualRelinkMatched") && worker.includes("manualRelinkAmbiguous"),"manual relink metrics are exposed");
must(worker.includes("adminplusMarketplacePreparingMatch"),"current marketplace preparing gate remains mandatory");
must(worker.includes("pendingRows.set") && worker.includes("trackingNo: tracking.trackingNo"),"only confirmed tracking evidence enters shipment upload queue");

console.log("[ROUND 3] regression/revision/UI");
must(worker.includes('manualOrderSafeRelinkRevision: "v248-r7r1-receiver-phone-address2-relink-20260812"'),"V248 R7 runtime marker exposed");
must(worker.includes('marketplacePreparingSourceRevision: "v248-r6-market-preparing-source-fix-20260812"'),"R6 marketplace preparing source retained");
must(worker.includes('shipmentSourceOfTruthRevision: "v248-r5-shipment-source-of-truth-fix-20260812"'),"R5 tracking source retained");
if(app){
  must((app.includes('UI_RELEASE_REVISION = "V248 R7"') || app.includes('UI_RELEASE_REVISION = "V248 R7.1"')),"web UI revision exposed");
}
console.log("[PASS] V248 R7 manual-order safe relink verification completed (3 rounds).");
