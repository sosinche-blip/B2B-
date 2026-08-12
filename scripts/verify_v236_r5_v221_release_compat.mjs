import fs from "node:fs";
const app=fs.readFileSync("apps/web/src/App.tsx","utf8");
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const verifier=fs.readFileSync("scripts/verify_v221_toss_paid_collection_fix.mjs","utf8");
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] V221 runtime retained");
must(worker.includes("toss-paid-collection-v221-20260809"),"Worker still exposes Toss PAID collection revision");
must(worker.includes('tossPaidCollectionRevision'),"Toss PAID collection status marker remains wired");

console.log("[ROUND 2] current UI release");
must(/const UI_RELEASE_REVISION = "V248 R(?:[234567]|7\.1)"/.test(app),"current UI release marker exists");
must(verifier.includes("V221 PAID collection remains present in current release"),"V221 verifier accepts current-release semantics");

console.log("[ROUND 3] regression");
must(worker.includes("orderProductStatus") && worker.includes("PAID"),"PAID fallback filtering remains present");
must(worker.includes("toss-confirmed-link-alias-v220-20260809"),"V220 Toss alias retained");

console.log("[PASS] V236 R5 V221 release compatibility completed (3 rounds).");
