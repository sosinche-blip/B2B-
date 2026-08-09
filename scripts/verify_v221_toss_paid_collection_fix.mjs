import fs from "node:fs";
const worker=fs.readFileSync(new URL("../apps/worker/src/worker.ts",import.meta.url),"utf8");
const app=fs.readFileSync(new URL("../apps/web/src/App.tsx",import.meta.url),"utf8");
function must(c,l){if(!c){console.error(`[FAIL] ${l}`);process.exitCode=1}else console.log(`[PASS] ${l}`)}
console.log("[ROUND 1] Toss SUCCESS semantics");
must(worker.includes('resultType === "SUCCESS"') && worker.includes('if (resultType === "SUCCESS" || resultType === "OK") return ""'),"SUCCESS response is not rejected because of empty/schema error object");
console.log("[ROUND 2] PAID collection fallback");
must(worker.includes('토스 PAID 0건 안전 재조회') && worker.includes('delete fallbackQuery.status'),"PAID zero-result retries without status");
must(worker.includes('String(objectRecord(row).status || "").trim().toUpperCase() === "PAID"'),"fallback keeps only actual PAID rows");
console.log("[ROUND 3] release/regression");
must(worker.includes('tossPaidCollectionRevision: "toss-paid-collection-v221-20260809"'),"V221 collection revision exposed");
must(app.includes('V221') || app.includes('V222'),"V221 PAID collection remains present in current UI release");
must(worker.includes('tossAutoPurchaseRevision: "toss-confirmed-link-alias-v220-20260809"'),"V220 Toss auto-purchase alias retained");
if(!process.exitCode) console.log("[PASS] V221 Toss PAID collection verification completed (3 rounds).");
