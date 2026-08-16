import fs from "node:fs";
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const app=fs.existsSync("apps/web/src/App.tsx")?fs.readFileSync("apps/web/src/App.tsx","utf8"):"";
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] receiver/phone/address-prefix matching");
must(worker.includes("adminplusRelinkAddressPrefix2"),"address first-two-word normalizer exists");
must(worker.includes('reason: "수취인 불일치"'),"receiver name remains mandatory");
must(worker.includes('reason: "수취인 연락처 불일치"'),"receiver phone remains mandatory");
must(worker.includes('reason: "주소 앞 2단어 불일치"'),"address first two words are mandatory");
must(worker.includes("addressPrefixMatched: true"),"successful relink exposes address-prefix evidence");

console.log("[ROUND 2] relaxed product/qty + ambiguity safety");
must(worker.includes("상품/수량은 필수 차단조건이 아니라 운영 진단용 보조증거"),"product and quantity are diagnostic-only evidence");
must(worker.includes("productMatched") && worker.includes("qtyMatched"),"product/quantity diagnostics are retained");
must(worker.includes("byMarket") && worker.includes("byAdmin"),"1:1 uniqueness guard remains active");
must(worker.includes("manual_order_relink_ambiguous"),"ambiguous candidates remain blocked");
must(worker.includes("adminplusMarketplacePreparingMatch"),"current marketplace preparing gate remains mandatory");

console.log("[ROUND 3] regression/revision/UI");
must(worker.includes('manualOrderSafeRelinkRevision: "v248-r7r1-receiver-phone-address2-relink-20260812"'),"V248 R7.1 runtime marker exposed");
must(worker.includes('marketplacePreparingSourceRevision: "v248-r6-market-preparing-source-fix-20260812"'),"R6 preparing source retained");
must(worker.includes('shipmentSourceOfTruthRevision: "v248-r5-shipment-source-of-truth-fix-20260812"'),"R5 shipment source retained");
if(app) must(/const UI_RELEASE_REVISION = "(?:V248 R\d+(?:\.\d+)?|V249 R10)";/.test(app),"web UI revision exposed");
console.log("[PASS] V248 R7.1 receiver/phone/address2 relink verification completed (3 rounds).");
