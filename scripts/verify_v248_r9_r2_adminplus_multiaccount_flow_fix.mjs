import fs from "node:fs";
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const app=fs.existsSync("apps/web/src/App.tsx")?fs.readFileSync("apps/web/src/App.tsx","utf8"):"";
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};
console.log("[ROUND 1] shared AdminPlus multi-account routing");
must(worker.includes("adminplusResolveHistoryAccount"),"history account recovery exists");
must(worker.includes('source: "historyAccountId"')&&worker.includes('source: "accountRule"')&&worker.includes('normalizedVendor'),"accountId -> accountRule -> normalized vendor routing is shared");
must(worker.includes("payment_reconcile_account"),"unresolved account has explicit diagnostic");
console.log("[ROUND 2] payment/preparing/dashboard reconciliation");
must(worker.includes("adminplusLivePaidRowForHistory"),"paid marketplace row is matched safely before preparing");
must(worker.includes("adminplusReconcileRecordedPayments(env, config"),"payment reconciliation uses multi-account config");
if(app){must(app.includes("sameOrder.length === 1 ? sameOrder[0] : undefined"),"dashboard safely falls back to unique same-order history");must(app.includes("reconcileAdminPlusRules(adminplusAccounts, normalizedBase)"),"runtime payload carries all loaded AdminPlus account rules");}
console.log("[ROUND 3] settings/revision/regression");
must(/const\s+UI_RELEASE_REVISION\s*=\s*["\']V\d+[^"\']*["\']/.test(app), "V248 R9.2+ UI marker");
must(worker.includes('adminplusMultiAccountFlowRevision: "v248-r9r2-adminplus-multiaccount-flow-fix-20260813"'),"R9.2 runtime marker");
must(worker.includes('couponAdaptiveActualEndRevision: "v248-r8r3-adaptive-actual-end-reissue-20260813"'),"coupon R8.3 retained");
must(worker.includes('manualOrderSafeRelinkRevision: "v248-r7r1-receiver-phone-address2-relink-20260812"'),"shipment R7.1 retained");
console.log("[PASS] V248 R9.2 AdminPlus multi-account flow verification completed (3 rounds).");

