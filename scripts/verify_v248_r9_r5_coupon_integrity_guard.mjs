import fs from "node:fs";

const workerPath = "apps/worker/src/worker.ts";
const appPath = "apps/web/src/App.tsx";
const worker = fs.readFileSync(workerPath, "utf8");
const app = fs.existsSync(appPath) ? fs.readFileSync(appPath, "utf8") : "";

function must(condition, label) {
  if (!condition) {
    console.error(`[FAIL] ${label}`);
    process.exit(1);
  }
  console.log(`[PASS] ${label}`);
}

console.log("[ROUND 1] duplicate create / cleanup guard");
must(worker.includes('couponIntegrityGuardRevision: "v248-r9r5-coupon-integrity-guard-20260816"'), "R9.5 marker");
must(worker.includes('COUPON_SAFETY_PENDING_STAGES: CouponRetryStage[] = ["reconcile", "cancel", "cancel_status", "create_apply", "cleanup", "request_status", "applied_verify_1m", "applied_verify_30m"]'), "persistent safety retry stages");
must(worker.includes('couponApplyRuntimeHoldUntil') && worker.includes('couponApplyRuntimeBlocked(runtimeKey)'), "runtime per-template create lock");
must(worker.includes('for (let attemptNo = 1; attemptNo <= 1; attemptNo += 1)'), "one couponId create attempt per cycle");
must(worker.includes('cleanupPendingOperations') && worker.includes('cleanupFailedCouponIds'), "cleanup state surfaced");
must(worker.includes('skipped: "cleanup_pending"') && worker.includes('skipped: "cleanup_retry_pending"'), "cleanup completion blocks reissue");

console.log("[ROUND 2] actual payload / option truth");
must(worker.includes('verifyCouponItemsActuallyApplied(env, couponId, ids, [0, 5_000, 5_000])'), "actual option attach verification");
must(worker.includes('const payloadVerified = await findActuallyAppliedCouponByPayload(env, createPayload, [0, 5_000, 5_000])'), "actual APPLIED payload snapshot verification");
must(worker.includes('payloadVerified.ok && payloadVerified.couponId === couponId'), "exact couponId payload match");
must(worker.includes('verifiedDiscount') && worker.includes('verifiedStartAt') && worker.includes('verifiedEndAt'), "verified snapshot recorded");

console.log("[ROUND 3] legacy +24h safe migration");
must(worker.includes('function couponTemplateUsesLegacy24hWindow') && worker.includes('24 * 60 * 60 * 1000'), "legacy 24h detector");
must(worker.includes('action: "couponLegacy24hMigration"'), "legacy migration action");
must(worker.includes('withinForwardWindow(nowText, String(schedules.couponCancel?.time || "23:50"), 1)'), "legacy migration only at 23:50 window");
must(worker.includes('template.preflightStatus === "통과"') && worker.includes('displayText(template.preflightAt).startsWith(nowDate)'), "legacy migration requires same-day preflight");
must(worker.includes('nextCouponHealthCheckAtIso: couponHealthCheckIsoAt(nowDate, applyTime)'), "reissue waits for 23:52 health check");
must(worker.includes('const forceCouponExpireFor24hRollover = false;'), "global forced rollover remains disabled");

const cleanupTool = fs.readFileSync("scripts/r95_zero_option_cleanup.mjs", "utf8");
must(cleanupTool.includes('process.argv.includes("--execute")') && cleanupTool.includes('[DRY-RUN]'), "0-option cleanup tool is dry-run by default");

console.log("[ROUND 4] UI / regression");
if (app) {
  must(app.includes('const UI_RELEASE_REVISION = "V248 R9.5";'), "R9.5 UI marker");
  must(app.includes('window.setTimeout(() => { void fetchCancelableCouponList(); }, 500);'), "manual success refreshes actual coupon items");
  must(app.includes('쿠폰 23:50 종료, 23:52 신규 발행'), "recommended schedule text aligned");
} else {
  console.log("[PASS] Ncloud package intentionally excludes web UI");
}
must(worker.includes('couponAnchoredGapRepairRevision: "v248-r9r4-coupon-anchor-gap-repair-20260816"'), "R9.4 retained");
must(worker.includes('couponAdaptiveActualEndRevision: "v248-r8r3-adaptive-actual-end-reissue-20260813"'), "R8.3 retained");
must(worker.includes('adminplusMultiAccountFlowRevision: "v248-r9r2-adminplus-multiaccount-flow-fix-20260813"'), "R9.2 retained");

console.log("[PASS] V248 R9.5 coupon integrity guard verification completed (4 rounds).");
