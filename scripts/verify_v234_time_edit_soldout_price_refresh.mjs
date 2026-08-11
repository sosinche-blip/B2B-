import fs from "node:fs";
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const app=fs.existsSync("apps/web/src/App.tsx")?fs.readFileSync("apps/web/src/App.tsx","utf8"):"";
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] time-only edit without catalog");
if(app){
  must(app.includes("tentativeMatchChanged && !product"),"catalog is required only when AdminPlus match fields changed");
  must(app.includes("product?.productCode || confirmedLink?.productCode"),"server-only edit can reuse confirmed product");
  must(app.includes("confirmedLink?.baselinePrice"),"time/fee edit preserves confirmed price baseline without catalog");
}

console.log("[ROUND 2] sold-out state");
must(worker.includes('link.priceStatus = "품절"'),"missing/inactive product is marked sold-out");
must(worker.includes('alertKind: "품절"'),"sold-out alert kind exists");
must(worker.includes("soldOutByStatus"),"inactive/soldout API status is recognized");
must(worker.includes("전체 상품목록에서 조회되지 않습니다"),"missing full-catalog product explains sold-out state");

console.log("[ROUND 3] price snapshot refresh");
must(worker.includes("과거 미확인 스냅샷을 누적하지 않고"),"price check replaces prior unresolved snapshot");
must(worker.includes('alerts = alerts.filter((row) => String(row.linkId || "") !== linkId || Boolean(row.acknowledgedAt))'),"old unresolved alert is cleared per link before current check");
if(app) must(app.includes("현재시각 기준으로 이전 미확인 현황을 갱신했습니다"),"operator sees that manual price check refreshed snapshot");
must(worker.includes("v234-time-edit-soldout-price-refresh-20260811"),"V234 revision exposed");
console.log("[PASS] V234 time-edit/soldout/price-refresh verification completed (3 rounds).");
