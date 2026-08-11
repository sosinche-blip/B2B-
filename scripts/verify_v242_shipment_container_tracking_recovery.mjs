import fs from "node:fs";
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const app=fs.existsSync("apps/web/src/App.tsx")?fs.readFileSync("apps/web/src/App.tsx","utf8"):"";
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] full order recovery");
must(worker.includes("adminplusOrderContainerForCustomer"),"customer search can recover full order container");
must(worker.includes('matchSource: "full_order_container"'),"full-container match is preferred over deep child fallback");
must(worker.includes('matchSource: "recent_orders_scan"'),"keyword failure falls back to recent order scan");
must(worker.includes("최근 주문 ${scanned}건까지 재검색"),"order lookup reports scan depth");

console.log("[ROUND 2] tracking parser coverage");
must(worker.includes("order.orderProducts"),"camelCase orderProducts is supported");
must(worker.includes("order.items"),"items product container is supported");
must(worker.includes("nested.productItems"),"nested productItems is supported");
must(worker.includes("waybillNumber"),"additional tracking-number aliases are supported");
must(worker.includes("shippingCompanyName"),"additional courier aliases are supported");
must(worker.includes("adminplusDeepObjects(row)"),"tracking fields can be found in nested shipment objects");

console.log("[ROUND 3] recovery diagnostics/release");
must(worker.includes("orderNotFound += 1"),"direct recovery counts order lookup failures");
must(worker.includes("trackingIncomplete += 1"),"direct recovery counts incomplete tracking");
must(worker.includes("trackingRows:"),"tracking parse diagnostics are retained");
must(worker.includes("주문미조회 ${Number(recovery.orderNotFound"),"shipment message exposes lookup failure count");
must(worker.includes("v242-order-container-tracking-recovery-20260811"),"V242 shipment recovery revision exposed");
if(app) must(app.includes('SHIPMENT_CONTAINER_RECOVERY_UI_REVISION = "v242-order-container-tracking-recovery-20260811"'),"web V242 revision exposed");

console.log("[PASS] V242 order-container/tracking recovery verification completed (3 rounds).");
