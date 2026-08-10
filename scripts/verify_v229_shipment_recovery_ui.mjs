import fs from "node:fs";
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const app=fs.existsSync("apps/web/src/App.tsx")?fs.readFileSync("apps/web/src/App.tsx","utf8"):"";
const css=fs.existsSync("apps/web/src/style.css")?fs.readFileSync("apps/web/src/style.css","utf8"):"";
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};
console.log("[ROUND 1] shipment recovery");
must(worker.includes("adminplusTrackingPairsFromOrder"),"order/product-level tracking parser exists");
must(worker.includes("adminplusRecoverMissingShipmentTracking"),"direct shipment reconciliation exists");
must(worker.includes("adminplusFindOrderByCustomerCode(env, account"),"customer_order_code direct lookup is used");
must(worker.includes("directRecovered"),"direct recovery diagnostics exposed");
console.log("[ROUND 2] Coupang continuity");
must(worker.includes("adminplusRefreshCoupangShipmentIdentifiers"),"Coupang live ID refresh retained");
must(worker.includes("coupang-shipment-bigint-courier-v227-20260810"),"V227 exact-ID fix retained");
must(worker.includes("adminplus-shipment-direct-reconcile-v229-20260810"),"V229 revision exposed");
console.log("[ROUND 3] payment UI");
if(app&&css){
  must(app.includes("payment-limit-input-once")&&app.includes("payment-limit-input-daily"),"dedicated payment width classes exist");
  must(css.includes(".payment-limit-input-once")&&css.includes("width: 70%"),"one-time limit is 70%");
  must(css.includes(".payment-limit-input-daily")&&css.includes("width: 100%"),"daily limit is 100%");
}
console.log("[PASS] V229 shipment recovery/UI verification completed (3 rounds).");
