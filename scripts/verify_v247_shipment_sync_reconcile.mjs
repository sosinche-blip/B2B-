import fs from "node:fs";
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const pass=(m)=>console.log(`[PASS] ${m}`); const must=(v,m)=>{if(!v)throw new Error(`[FAIL] ${m}`);pass(m)};
console.log("[ROUND 1] shipment recovery eligibility / ordering");
must(worker.includes("function adminplusHistorySubmitted"),"submitted AdminPlus order helper exists");
const candidate=worker.slice(worker.indexOf("function adminplusLegacyShipmentCandidate"),worker.indexOf("async function adminplusRecoverMissingShipmentTracking"));
must(candidate.includes("adminplusHistorySubmitted(hist)"),"tracking recovery requires AdminPlus submission");
must(worker.includes("adminplusRecoverShipmentFromCurrentOrders") && worker.includes("historyByCustomer"),"manual/external payment shipment recovery uses current AdminPlus tracking evidence");
const run=worker.slice(worker.indexOf("async function adminplusShipmentRun"),worker.indexOf("async function adminplusPurchaseEndpoint"));
must(
  (run.includes("adminplusEnsureMarketplacePreparing") && run.indexOf("adminplusRecoverMissingShipmentTracking") < run.indexOf("adminplusEnsureMarketplacePreparing")) ||
  (run.includes("adminplusCurrentMarketplacePreparingOrders") && run.indexOf("adminplusCurrentMarketplacePreparingOrders") < run.indexOf("adminplusRecoverMissingShipmentTracking")),
  "tracking recovery follows legacy transition ordering or current marketplace-preparing source ordering"
);
console.log("[ROUND 2] marketplace transition / upload safety");
const prep=worker.slice(worker.indexOf("async function adminplusEnsureMarketplacePreparing"),worker.indexOf("async function adminplusProcessPayments"));
must((prep.includes('paymentStatus||""')&&prep.includes('=== "완료"')) || prep.includes('paymentStatus || "") === "완료"') || prep.includes('paymentStatus||"")==="완료"'),"preparing requires completed payment");
must(!prep.includes("trackingNo") && !prep.includes("courier"),"tracking/courier no longer gate preparing");
must((prep.includes("currentPaidRows.find") || prep.includes("adminplusLivePaidRowForHistory")) && prep.includes("shipmentBoxId") && prep.includes("orderProductId"),"current paid marketplace identifiers are reconciled before preparing");
must(prep.includes("const ackId=") && prep.includes("결제완료 후 상품준비중 변경 식별자가 없습니다."),"preparing requires a current marketplace acknowledge identifier");
must(worker.includes("sourceKey: String(hist.sourceKey || adminplusHistoryKey"),"sourceKey preserved through shipment row");
must(run.includes("const key = String(row.sourceKey || adminplusHistoryKey"),"shipment success uses stable sourceKey");
console.log("[ROUND 3] regression / revision");
must(worker.includes('shipmentSyncReconcileRevision: "v247-shipment-sync-reconcile-fix-20260812"'),"V247 marker exposed");
must(worker.includes('shipmentContainerRecoveryRevision: "v242-order-container-tracking-recovery-20260811"'),"V242 recovery retained");
must(worker.includes('currentPolicyRevision: "v246-current-policy-verifier-alignment-20260812"'),"V246 policy retained");
pass("V247 shipment sync reconcile verification completed (3 rounds).");
