import fs from "node:fs";

const worker = fs.readFileSync(
  "apps/worker/src/worker.ts",
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

console.log(
  "[PASS] V250 option-ID coupon rotation verification completed."
);
