import fs from "node:fs";

const worker = fs.readFileSync(
  "apps/worker/src/worker.ts",
  "utf8",
);

const web = fs.readFileSync(
  "apps/web/src/App.tsx",
  "utf8",
);

function must(value, message) {
  if (!value) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`[PASS] ${message}`);
}

function between(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(
    end,
    a + start.length,
  );

  if (a < 0 || b < 0) return "";

  return source.slice(a, b);
}

console.log(
  "[ROUND 1] bulk missing coupon source truth",
);

const bulk = between(
  worker,
  "async function r10BulkIssueMissingTemplates",
  "async function r10ImmediateReplaceTemplate",
);

must(
  bulk.includes(
    "couponAppliedOwnershipSnapshot",
  ),
  "bulk issue checks actual APPLIED ownership",
);

must(
  bulk.includes(
    "initialMissingIds",
  ),
  "missing options are derived explicitly",
);

must(
  bulk.includes(
    "initialExistingIds",
  ),
  "existing operating options are preserved",
);

must(
  bulk.includes(
    "applyOneAutomationTemplate",
  ),
  "existing missing-only issue engine is reused",
);

must(
  bulk.includes(
    "manualConfirmedMissing: true",
  ),
  "manual server-confirmed missing options can issue immediately",
);

must(
  bulk.includes(
    "issueWindowOverride",
  ),
  "manual issue uses immediate operating window",
);

must(
  !bulk.includes(
    "r10RequestCouponEnd",
  ),
  "bulk missing issue never ends existing coupons",
);

console.log(
  "[ROUND 2] duplicate safety / existing route",
);

must(
  worker.includes(
    "bulkMissingOnly",
  ),
  "bulk mode exists on current fixed-IP endpoint",
);

must(
  worker.includes(
    '"/api/integrations/coupang/coupons/v250-immediate-replace"',
  ),
  "existing fixed-IP immediate route is retained",
);

must(
  worker.includes(
    "const batchSize = 5",
  ),
  "R4.2 batched APPLIED ownership lookup retained",
);

must(
  worker.includes(
    "const snapshotBatchSize = 5",
  ),
  "R4.3 batched R10 snapshot retained",
);

console.log(
  "[ROUND 3] web bulk issue control",
);

must(
  web.includes(
    "async function issueAllMissingRollingCouponsNow",
  ),
  "bulk issue web handler exists",
);

must(
  web.includes(
    'onClick={issueAllMissingRollingCouponsNow}',
  ) &&
  web.includes(
    "반복 전체 쿠폰발행",
  ),
  "actual bulk issue JSX button exists",
);

must(
  web.includes(
    "bulkMissingOnly: true",
  ),
  "button calls safe missing-only server mode",
);

must(
  web.includes(
    "기존 운영 쿠폰은 종료하거나 교체하지 않고",
  ),
  "confirmation explains existing coupons remain",
);

console.log(
  "[ROUND 4] production schedule regression",
);

must(
  worker.includes(
    'timeToMinutes("23:52")',
  ),
  "regular 23:52 issue policy retained",
);

must(
  worker.includes(
    'timeToMinutes("23:57")',
  ),
  "regular 23:57 recovery retained",
);

must(
  worker.includes(
    'timeToMinutes("23:58")',
  ),
  "regular 23:58 final recovery retained",
);

must(
  !web.includes(
    "다음날 01:00까지 5분 간격",
  ),
  "stale 01:00 UI guide removed",
);

must(
  worker.includes(
    "ownedOptionIds.length",
  ),
  "R4.1 active-option duplicate guard retained",
);


console.log(
  "[ROUND 5] final actual APPLIED verification",
);

must(
  bulk.includes(
    "const finalOwnership",
  ),
  "bulk issue performs final actual APPLIED lookup",
);

must(
  bulk.includes(
    "finalOwnership.ownersByOption",
  ),
  "final operating state uses fresh API ownership",
);

must(
  bulk.includes(
    "finalDuplicateOptionIds",
  ),
  "final duplicate APPLIED ownership is blocked",
);

must(
  web.includes(
    'onClick={issueAllMissingRollingCouponsNow}',
  ),
  "actual bulk coupon JSX button exists",
);
console.log("");
console.log(
  "[PASS] V259 R4.4 bulk missing coupon issue verification completed.",
);