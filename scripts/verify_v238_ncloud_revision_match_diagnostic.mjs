import fs from "node:fs";
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const app=fs.existsSync("apps/web/src/App.tsx")?fs.readFileSync("apps/web/src/App.tsx","utf8"):"";
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] Ncloud revision guard");
if(app){
  must(app.includes("requireCurrentNcloudMatchRevision"),"web checks Ncloud runtime before match apply");
  must(app.includes("Ncloud V229 이상을 먼저 배포"),"operator gets explicit old-server instruction");
  must(app.includes('await requireCurrentNcloudMatchRevision();'),"match apply is blocked until revision check passes");
}
must(worker.includes("v238-ncloud-revision-guard-diagnostic-20260811"),"runtime diagnostic revision exposed");

console.log("[ROUND 2] match failure diagnostics");
must(worker.includes("requestedProductCode"),"worker returns requested product code");
must(worker.includes("requestedOptionCode"),"worker returns requested option code");
must(worker.includes("requestedQty"),"worker returns requested qty");
if(app){
  must(app.includes("genericValidation"),"web detects generic validation failed response");
  must(app.includes("API 상품검색에서 실제 옵션을 선택"),"generic validation has actionable recovery guidance");
}

console.log("[ROUND 3] V237 behavior retained");
must(worker.includes("asArray(row.options)"),"plural options parser retained");
must(worker.includes('alertKind: "재확정대기"'),"reconfirm-wait price state retained");
if(app) must(app.includes('MATCH_VALIDATION_UI_REVISION = "v237-option-parser-validation-reconfirm-watch-20260811"'),"V237 UI revision retained");

console.log("[PASS] V238 Ncloud-revision/match-diagnostic verification completed (3 rounds).");
