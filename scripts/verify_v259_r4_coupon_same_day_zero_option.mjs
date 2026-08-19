import fs from "node:fs";

const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");

function must(value, message) {
  if (!value) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`[PASS] ${message}`);
}

function between(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0) return "";
  return source.slice(a, b);
}

console.log("[ROUND 1] same-day coupon repair window");

const repairBlock = between(
  worker,
  "function r10RepairWindowActive",
  "function r10ClaimSlot",
);

must(
  repairBlock.includes('timeToMinutes("23:52")'),
  "repair starts at 23:52"
);

must(
  repairBlock.includes('timeToMinutes("23:57")'),
  "five-minute recovery check remains at 23:57"
);

must(
  repairBlock.includes('timeToMinutes("23:58")'),
  "final same-day recovery check is 23:58"
);

must(
  !repairBlock.includes('timeToMinutes("01:00")'),
  "next-day 01:00 recovery removed"
);

must(
  !repairBlock.includes("offsetFrom2352"),
  "cross-midnight retry calculation removed"
);

console.log("[ROUND 2] zero-option validation ordering");

const schedulerBlock = between(
  worker,
  "async function runR10CouponScheduler",
  "async function schedulerTick",
);

const snapshotPos = schedulerBlock.indexOf(
  "const snapshot = await r10AppliedSnapshot"
);
const zeroPos = schedulerBlock.indexOf(
  "const zeroOptionCouponIds"
);
const pendingPos = schedulerBlock.indexOf(
  "const pendingTemplates"
);
const verifiedPos = schedulerBlock.indexOf(
  'status: "all_verified"'
);

must(
  snapshotPos >= 0 &&
  zeroPos > snapshotPos &&
  pendingPos > zeroPos &&
  verifiedPos > pendingPos,
  "actual APPLIED/zero-option check runs before all_verified"
);

must(
  schedulerBlock.includes('action: "couponZeroOptionCleanup"'),
  "zero-option cleanup retained"
);

must(
  schedulerBlock.includes(
    "종료 확인 전 신규발행하지 않고 다음 5분 주기에서 재확인"
  ),
  "zero-option still blocks same-cycle issuance"
);

must(
  schedulerBlock.includes("actualAppliedChecked: true"),
  "all_verified records actual APPLIED check"
);

console.log("[ROUND 3] option-ID pre-create duplicate prevention");

const issueBlock = between(
  worker,
  "async function r10IssueTemplate",
  "async function runR10CouponScheduler",
);

const ownershipPos = issueBlock.indexOf(
  "couponAppliedOwnershipSnapshot"
);
const createPos = issueBlock.indexOf(
  "const create = await coupangSignedRequestWithRetry"
);

must(
  ownershipPos >= 0 &&
  createPos >= 0 &&
  ownershipPos < createPos,
  "global APPLIED option ownership is checked before coupon create"
);

must(
  issueBlock.includes("ownershipGuard.ownersByOption.get(id)"),
  "existing coupon ownership uses optionId source-of-truth"
);

must(
  issueBlock.includes("ownedOptionIds.length"),
  "any already-owned target option blocks new coupon creation"
);

must(
  issueBlock.includes("duplicateOwnedOptionIds"),
  "multiple APPLIED owners are explicitly blocked"
);

must(
  issueBlock.includes("신규 couponId를 생성하지 않고"),
  "operator diagnostic clearly states no duplicate coupon creation"
);

const schedulerBlockR41 = between(
  worker,
  "async function runR10CouponScheduler",
  "async function schedulerTick",
);

must(
  schedulerBlockR41.includes(
    "const ownershipGuard = await couponAppliedOwnershipSnapshot"
  ),
  "scheduler uses one shared ownership snapshot per repair slot"
);

must(
  schedulerBlockR41.includes("{ ownershipGuard }"),
  "shared ownership guard is passed to R10 issue"
);

console.log("[ROUND 4] existing coupon safety");

must(
  worker.includes("r10IssueWindow"),
  "next coupon end remains anchored to 23:50"
);

must(
  worker.includes("couponItemsForAppliedVerification"),
  "actual applied item verification retained"
);

must(
  worker.includes("cleanupGeneratedCoupons"),
  "invalid generated coupon cleanup retained"
);

must(
  worker.includes("couponForceEnd2350"),
  "23:50 force-end retained"
);

must(
  worker.includes("adminplusPurchaseRun"),
  "AdminPlus purchase retained"
);

must(
  worker.includes("adminplusShipmentRun"),
  "AdminPlus shipment retained"
);

console.log("");
console.log("[PASS] V259 R4 same-day coupon repair / zero-option ordering verification completed.");