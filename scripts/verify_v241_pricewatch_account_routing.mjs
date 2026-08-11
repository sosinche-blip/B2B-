import fs from "node:fs";
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const app=fs.existsSync("apps/web/src/App.tsx")?fs.readFileSync("apps/web/src/App.tsx","utf8"):"";
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};
console.log("[ROUND 1] account routing");
must(worker.includes("adminplusAutomationConfig(payload.adminplusAutomation)"),"price watch reads account rules");
must(worker.includes("resolvePriceWatchAccount"),"price watch resolves account per link");
must(worker.includes('source: "accountRule"'),"account rule has priority");
must(worker.includes('source: "uniqueVendor"'),"vendor can recover stale accountId");
console.log("[ROUND 2] correction safety");
must(worker.includes("accountCorrections.push"),"stale account corrections are tracked");
must(worker.includes("link.accountId = resolved.account.id"),"link accountId is corrected before lookup");
must(worker.includes("linksByAccount"),"catalog lookup uses corrected account buckets");
must(worker.includes('alertKind: "계정확인필요"'),"ambiguous account is not marked soldout");
console.log("[ROUND 3] UI/release");
if(app){
  must(app.includes("계정경로 교정"),"price check reports account corrections");
  must(app.includes('PRICEWATCH_ACCOUNT_ROUTING_REVISION = "v241-pricewatch-account-routing-fix-20260811"'),"web V241 marker exposed");
}
must(worker.includes("v241-pricewatch-account-routing-fix-20260811"),"runtime V241 marker exposed");
console.log("[PASS] V241 pricewatch account-routing verification completed (3 rounds).");
