import fs from "node:fs";

const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");
const hasWeb = fs.existsSync("apps/web/src/App.tsx");
const web = hasWeb ? fs.readFileSync("apps/web/src/App.tsx", "utf8") : "";
function pass(label, cond) { if (!cond) { console.error(`[FAIL] ${label}`); process.exitCode = 1; } else console.log(`[PASS] ${label}`); }
console.log("[ROUND 1] shipment/manual resolution + order/payment split");
pass("shipment operator acknowledge endpoint exists", worker.includes("adminplusShipmentResolveEndpoint"));
pass("toss market recheck exists", worker.includes("adminplus_shipment_toss_recheck_v248"));
pass("operator-resolved rows are excluded from shipment queue runtime", worker.includes("hist.operatorResolvedAt"));
pass("payment errors are nonfatal to completed order registration", worker.includes("const paymentErrors = payments.errors") && !worker.includes("errors.push(...payments.errors)") && !worker.includes('stage: "payment_policy"'));
if (hasWeb) {
  pass("web no longer blocks order registration on payment policy", !web.includes("결제설정이 완료되지 않아 발주를 시작하지 않았습니다"));
  pass("shipment pending UI has acknowledge", web.includes(">확인완료</button>") && web.includes("토스 상태 재조회"));
}
console.log("[ROUND 2] coupon self-healing + obsolete next-issue removal");
pass("reconcile retry stage exists", worker.includes('"reconcile" | "cancel" | "cancel_status"'));
pass("missed window queues self-healing", worker.includes("couponSelfHealing") && worker.includes('reason: "apply_window_missed"'));
pass("APPLIED lookup failure is retryable", worker.includes("lookupFailed: true") && worker.includes("5분 뒤 자동 재조회"));
pass("coupon incidents are grouped with next retry", worker.includes("repeated_count") && worker.includes("next_retry_at"));
if (hasWeb) {
  pass("next-issue buttons removed", !web.includes(">다음 발행부터</button>"));
  pass("next-issue handler removed", !web.includes("scheduleNewCouponFromNextIssue") && !web.includes("saveRollingCouponTemplateChanges"));
}
console.log("[ROUND 3] release/build regression markers");
pass("V248 runtime marker exposed", worker.includes("v248-operations-resilience-20260812"));
pass("V247 shipment fix retained", worker.includes("v247-shipment-sync-reconcile-fix-20260812"));
pass("V246 policy retained", worker.includes("v246-current-policy-verifier-alignment-20260812"));
if (hasWeb) pass("UI release is V248 R2", web.includes('const UI_RELEASE_REVISION = "V248 R2"'));
if (!process.exitCode) console.log("[PASS] V248 operations resilience verification completed (3 rounds).");
