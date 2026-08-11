import fs from "node:fs";
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] union typing");
must(worker.includes("scanned: Number(objectRecord(found).scanned || 0) || 0"),"scanned diagnostic uses record-safe access");
must(!worker.includes("scanned: found.scanned || 0"),"unsafe found.scanned access removed");

console.log("[ROUND 2] shipment return structure");
const start=worker.indexOf("async function adminplusShipmentRun");
const end=worker.indexOf("async function adminplusPurchaseEndpoint",start);
const block=worker.slice(start,end);
const count=(block.match(/shipmentTargetSummary\s*:/g)||[]).length;
must(count===2,"shipmentTargetSummary exists once in preview return and once in execute return");
must(block.includes("dryRun: false"),"execute return path retained");

console.log("[ROUND 3] V243 metrics");
must(block.includes("trackingReadyBefore"),"tracking-ready metric retained");
must(block.includes("preparingRetryPrepared"),"preparing retry metric retained");
must(worker.includes('shipmentTargetPaymentClarityHotfixRevision: "v243-r1-typescript-fix-20260811"'),"V243 R1 marker exposed");

console.log("[PASS] V243 R1 TypeScript hotfix verification completed (3 rounds).");
