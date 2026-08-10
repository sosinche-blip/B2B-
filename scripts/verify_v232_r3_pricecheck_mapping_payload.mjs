import fs from "node:fs";
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] price-check mapping payload");
must(worker.includes("const mappings = adminplusMappingRows(payload);"),"price check passes full settings payload to mapping parser");
must(!worker.includes("adminplusMappingRows(payload.mappings)"),"invalid unknown mappings argument is removed");

console.log("[ROUND 2] function contract");
must(worker.includes("function adminplusMappingRows(payload: Record<string, unknown>)"),"mapping parser contract remains Record payload");
must(worker.includes("return asArray(payload.mappings)"),"mapping parser itself reads mappings from payload");

console.log("[ROUND 3] regression/release");
must(worker.includes("async function adminplusPriceCheckRun("),"price check remains async");
must(worker.includes("v232-r2-remove-stray-async-runtime-fix-20260811"),"R2 runtime fix retained");
must(worker.includes("v232-r3-pricecheck-mapping-payload-type-fix-20260811"),"R3 type hotfix marker exposed");
must(worker.includes("adminplusGlobalCatalogSearchEndpoint"),"global catalog search retained");

console.log("[PASS] V232 R3 price-check mapping payload verification completed (3 rounds).");
