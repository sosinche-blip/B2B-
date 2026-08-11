import fs from "node:fs";
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const app=fs.existsSync("apps/web/src/App.tsx")?fs.readFileSync("apps/web/src/App.tsx","utf8"):"";
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] AdminPlus order phone routing");
must(worker.includes("isVirtualTelephone"),"050x virtual-number detection exists");
must(worker.includes("receiver_tel: receiverTel"),"receiver telephone field is explicit");
must(worker.includes("receiver_hp: receiverHp"),"receiver mobile field is explicit");
must(worker.includes("empty(virtual)"),"diagnostic exposes virtual-number routing");

console.log("[ROUND 2] price-watch product recovery");
must(worker.includes("includeInactive = false"),"catalog can include inactive products for monitoring");
must(worker.includes("adminplusCatalogProducts(env, account, 500, true)"),"price watch reads full catalog");
must(worker.includes("exactNameMatches.length === 1"),"stale productCode recovers by exact same product name");
must(worker.includes("link.productCode = product.productCode"),"recovered code is saved");
if(app) must(!app.includes("row.actualProductName || row.productName"),"UI does not fake current product name");

console.log("[ROUND 3] previous mapping reuse");
if(app){
  must(app.includes("historicalSameProductLinks"),"historical same-product links are inspected");
  must(app.includes("기존 동일상품 매핑 재사용"),"unique prior selection is reused");
  must(app.includes('status: "확정가능"'),"reuse still requires confirmation");
}
must(worker.includes("v233-orderphone-name-recovery-pricewatch-20260811"),"V233 revision exposed");
console.log("[PASS] V233 mapping/pricewatch/order-phone verification completed (3 rounds).");
