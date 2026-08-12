import fs from "node:fs";
const app=fs.readFileSync("apps/web/src/App.tsx","utf8");
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const verifier=fs.readFileSync("scripts/verify_v222_manual_purchase_queue_fix.mjs","utf8");
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] V222 manual queue runtime");
must(worker.includes("manualRun = false"),"purchase runner still distinguishes manual and scheduled execution");
must(worker.includes('adminplusPurchaseRun(env, payload, dryRun, "", true)'),"manual endpoint still includes backlog");
must(worker.includes("skipReasonCounts"),"manual queue diagnostics remain present");

console.log("[ROUND 2] current V236 release");
must(/const UI_RELEASE_REVISION = "V248 R[23]"/.test(app),"current release marker exists");
must(app.includes("summary.skipReasonCounts"),"manual queue exclusion diagnostics remain visible");
must(verifier.includes("current release") || verifier.includes("V236 엑셀 우선매핑"),"V222 verifier accepts current-release semantics");

console.log("[ROUND 3] regression");
must(worker.includes("manual-backlog-server-source-v222-20260809"),"V222 runtime revision retained");
must(worker.includes("toss-paid-collection-v221-20260809"),"V221 Toss PAID collection retained");
must(worker.includes("toss-confirmed-link-alias-v220-20260809"),"V220 Toss confirmed-link alias retained");
must(worker.includes("toss-stock-productitem-v219-20260809"),"V219 stock/productItem bridge retained");

console.log("[PASS] V236 R6 V222 release compatibility completed (3 rounds).");
