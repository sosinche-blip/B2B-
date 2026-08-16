import fs from "node:fs";

const worker = fs.readFileSync(
  "apps/worker/src/worker.ts",
  "utf8",
);

const app = fs.readFileSync(
  "apps/web/src/App.tsx",
  "utf8",
);

function check(ok, message) {
  if (!ok) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }

  console.log(`[PASS] ${message}`);
}

console.log("[ROUND 1] fixed schedule");

check(
  worker.includes('time: input.couponCancel?.time || "23:50"'),
  "23:50 force-end schedule",
);

check(
  worker.includes('time: input.couponApply?.time || "23:52"'),
  "23:52 issue schedule",
);

check(
  worker.includes("function r10RepairCheckDue"),
  "repair due function",
);

check(
  worker.includes("offsetFrom2352 % 5 === 0"),
  "23:52 anchored five-minute retry",
);

check(
  worker.includes('minute === timeToMinutes("01:00")'),
  "01:00 final recovery check",
);

console.log("[ROUND 2] force-end / option-id truth");

check(
  worker.includes("async function r10ForceEndAllTemplates"),
  "23:50 full target force-end",
);

check(
  worker.includes('action: "expire"'),
  "Coupang force-end request",
);

check(
  worker.includes("r10TemplateStoredCouponIds"),
  "stored coupon reference fallback",
);

check(
  worker.includes("r10CouponRowMatchesTemplate"),
  "automation coupon identification",
);

check(
  worker.includes("couponItemsForAppliedVerification"),
  "actual applied item verification",
);

console.log("[ROUND 3] zero-option / reissue");

check(
  worker.includes("entry.ids.size === 0"),
  "zero-option detection",
);

check(
  worker.includes('action: "couponZeroOptionCleanup"'),
  "zero-option is cleaned once before issuance",
);

check(
  worker.includes("종료 확인 전 신규발행하지 않고 다음 5분 주기에서 재확인"),
  "zero-option blocks same-cycle issuance",
);

const relevantStart = worker.indexOf(
  "const relevant = snapshot.entries.filter((entry) => {"
);

const relevantEnd = worker.indexOf(
  "  });",
  relevantStart
);

const relevantBlock =
  relevantStart >= 0 && relevantEnd > relevantStart
    ? worker.slice(relevantStart, relevantEnd)
    : "";

check(
  !relevantBlock.includes("r10CouponRowMatchesTemplate"),
  "individual reissue uses option-ID/coupon-ID, not coupon name",
);

check(
  worker.includes("APPLIED 0-option 쿠폰"),
  "zero-option force-end path",
);

check(
  worker.includes("r10CycleEndAt"),
  "daily cycle completion marker",
);

check(
  worker.includes("r10RequestCouponEnd"),
  "pending old coupon force-end retry",
);

check(
  worker.includes("r10IssueWindow"),
  "same-day 23:50 end anchor",
);

console.log("[ROUND 4] cleanup / regressions");

check(
  !worker.includes("r10ManualSingleTemplateTest"),
  "manual single-test function removed",
);

check(
  !worker.includes("/api/integrations/coupang/coupons/r10-single-test"),
  "manual single-test route removed",
);

check(
  !worker.includes("attachDiagnostic"),
  "temporary attach diagnostic removed",
);

check(
  worker.includes("adminplusPurchaseRun"),
  "AdminPlus automation retained",
);

check(
  worker.includes("adminplusShipmentRun"),
  "shipment automation retained",
);

check(
  worker.includes("tossProductOptionSync"),
  "Toss integration retained",
);


console.log("[ROUND 5] immediate replace / ended coupon");

check(
  worker.includes('v250r1.2-attach-diagnostic-time-20260816'),
  "V250 R1.2 immediate-replace revision marker",
);

check(
  worker.includes("async function r10ImmediateReplaceTemplate"),
  "V250 immediate replace endpoint helper",
);

check(
  worker.includes('/api/integrations/coupang/coupons/v250-immediate-replace'),
  "V250 immediate replace route",
);

check(
  worker.includes("{ forceReplace: true }"),
  "manual replace forces active coupon rotation",
);

check(
  worker.includes("options?.forceReplace") && worker.includes("r10CancelCouponAndVerify"),
  "manual replace waits for actual old coupon termination",
);

check(
  app.includes('callApi("/api/integrations/coupang/coupons/v250-immediate-replace"'),
  "UI now-coupon button uses V250 endpoint",
);

const immediateStart = app.indexOf("async function applyRollingCouponTemplateNow");
const immediateEnd = app.indexOf("function updateApiEndpointSetting", immediateStart);
const immediateBlock = immediateStart >= 0 && immediateEnd > immediateStart
  ? app.slice(immediateStart, immediateEnd)
  : "";

check(
  !immediateBlock.includes('/api/integrations/coupons/action-preview'),
  "legacy action-preview removed from now-coupon button",
);

check(
  immediateBlock.includes("반복대상은 유지") && !immediateBlock.includes('enabled: false'),
  "manual failure keeps repeat target enabled",
);

check(
  immediateBlock.includes("현재 APPLIED 쿠폰이 없어 종료 단계를 생략하고"),
  "ended/no-APPLIED coupon immediately creates new coupon",
);


console.log("[ROUND 6] attach diagnostic / failure timestamp");

check(
  worker.includes('diagnostic?: Record<string, unknown>') &&
  worker.includes('stage: "attach_status"') &&
  worker.includes('requestedId: attachRequestedId') &&
  worker.includes('summary: attachStatus.summary'),
  "attach partial-failure diagnostic is preserved",
);

const workerImmediateStart = worker.indexOf("async function r10ImmediateReplaceTemplate");
const workerImmediateEnd = worker.indexOf("async function schedulerTick", workerImmediateStart);
const workerImmediateBlock = workerImmediateStart >= 0 && workerImmediateEnd > workerImmediateStart
  ? worker.slice(workerImmediateStart, workerImmediateEnd)
  : "";

check(
  workerImmediateBlock.includes('preflightStatus: "실패" as const') &&
  workerImmediateBlock.includes('preflightAt: new Date().toISOString()'),
  "server failure refreshes preflight timestamp",
);

check(
  immediateBlock.includes('preflightStatus: "실패" as const') &&
  immediateBlock.includes('preflightAt: now'),
  "UI failure refreshes immediate-replace timestamp",
);

check(
  workerImmediateBlock.includes('diagnostic: result.diagnostic || null'),
  "immediate-replace response surfaces diagnostic",
);

console.log(
  "[PASS] V250 option-ID coupon rotation verification completed."
);

console.log("[ROUND 7] preflight / actual coupon UI status cleanup");

check(
  app.includes('v250r1.3-preflight-status-ui-cleanup-20260816'),
  "R1.3 coupon preflight status UI marker",
);

check(
  app.includes('전체 사전검증(발행 안 함)') &&
  app.includes('설정·옵션ID·API 연결상태만 점검하며 쿠팡 쿠폰은 발행하지 않습니다.'),
  "preflight clearly states it does not issue coupons",
);

check(
  app.includes('const applied = Boolean(row && text(row.status).toUpperCase() === "APPLIED" && actualItems > 0)') &&
  app.includes('actual?.applied ? "운영중"') &&
  app.includes('? "발행대기" : "미검증"'),
  "operating status requires actual APPLIED coupon items",
);

check(
  app.includes('headers={["자동운영", "실제 운영중", "발행대기", "확인필요", "미검증", "반복대상"]}'),
  "coupon summary separates actual operating from issue-waiting",
);

check(
  !app.includes('<summary>쿠폰 자동운영 미확인 실패'),
  "legacy coupon failure panel removed from UI",
);

check(
  worker.includes('.from("operation_audit_logs")'),
  "server audit logs remain retained",
);
