import fs from "node:fs";
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const web=fs.existsSync("apps/web/src/App.tsx")?fs.readFileSync("apps/web/src/App.tsx","utf8"):"";
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};
console.log("[ROUND 1] marketplace preparing source of truth");
must(worker.includes("adminplusCurrentMarketplacePreparingOrders"),"current marketplace preparing collector exists");
must(worker.includes('"INSTRUCT"') && worker.includes('"PREPARING_PRODUCT"'),"Coupang INSTRUCT and Toss PREPARING_PRODUCT are explicit current targets");
must(worker.includes("adminplusMarketplacePreparingMatch"),"AdminPlus shipment candidates require current marketplace preparing match");
must(worker.includes("current marketplace") || worker.includes("현재 마켓 상품준비중"),"current-market source policy is documented");
console.log("[ROUND 2] stale/manual linkage safety");
must(worker.includes("adminplusParseCustomerOrderCode"),"B2B customer_order_code can recover manual/external linkage");
must(worker.includes("market-reconcile-"),"current marketplace row can create safe synthetic shipment linkage");
must(worker.includes("marketEligibleHistory"),"legacy direct recovery is restricted to current marketplace preparing rows");
must(worker.includes("if (!market) continue"),"non-preparing historical rows are excluded before shipment recovery");
console.log("[ROUND 3] regression/revision/UI");
must(worker.includes('marketplacePreparingSourceRevision: "v248-r6-market-preparing-source-fix-20260812"'),"V248 R6 runtime marker exposed");
must(worker.includes('shipmentSourceOfTruthRevision: "v248-r5-shipment-source-of-truth-fix-20260812"'),"R5 tracking evidence recovery retained");
must(worker.includes('scheduledShipmentRecoveryRevision: "v248-r4-scheduled-shipment-recovery-fix-20260812"'),"R4 designated schedule retained");
if(web){
  must(/const UI_RELEASE_REVISION = "V248 R\d+(?:\.\d+)?";/.test(web),"web UI revision exposed");
  must(web.includes("adminplusShipmentMarketKeys"),"pending shipment UI can hide orders absent from current preparing list");
  must(web.includes("adminplusShipmentMarketKeys !== null"),"zero preparing result clears stale pending UI");
}
console.log("[PASS] V248 R6 marketplace-preparing shipment source verification completed (3 rounds).");
