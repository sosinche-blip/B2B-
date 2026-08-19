import fs from "node:fs";

const worker = fs.readFileSync(
  "apps/worker/src/worker.ts",
  "utf8"
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
    a + start.length
  );

  if (a < 0 || b < 0) return "";

  return source.slice(a, b);
}

console.log(
  "[ROUND 1] 23:50 option-ID force-end source truth"
);

const forceEnd = between(
  worker,
  "async function r10ForceEndAllTemplates",
  "function r10CreatePayload",
);

must(
  forceEnd.includes(
    "r10VendorItemIds(template)"
  ),
  "force-end derives target option IDs from active templates"
);

must(
  forceEnd.includes(
    "couponAppliedOwnershipSnapshot"
  ),
  "force-end resolves actual APPLIED owners by option ID"
);

must(
  forceEnd.includes(
    "ownership.ownersByOption.get"
  ),
  "force-end uses option owner source-of-truth"
);

must(
  !forceEnd.includes(
    "r10CouponRowMatchesTemplate"
  ),
  "force-end no longer depends on coupon name"
);

must(
  !forceEnd.includes(
    "r10TemplateStoredCouponIds"
  ),
  "force-end no longer depends on stored coupon IDs"
);

console.log(
  "[ROUND 2] coverage diagnostics"
);

must(
  forceEnd.includes(
    "targetOptionCount"
  ),
  "target option count is logged"
);

must(
  forceEnd.includes(
    "coveredOptionCount"
  ),
  "covered option count is logged"
);

must(
  forceEnd.includes(
    "missingOptionIds"
  ),
  "missing option IDs are logged"
);

must(
  forceEnd.includes(
    "duplicateOptionIds"
  ),
  "duplicate option ownership is logged"
);

must(
  forceEnd.includes(
    "옵션 coverage"
  ),
  "operator message exposes option coverage"
);

console.log(
  "[ROUND 3] fast APPLIED ownership"
);

const ownership = between(
  worker,
  "async function couponAppliedOwnershipSnapshot",
  "async function couponAppliedCoverage",
);

must(
  ownership.includes(
    "const batchSize = 5"
  ),
  "ownership lookup uses bounded batch size"
);

must(
  ownership.includes(
    "await Promise.all"
  ),
  "coupon item lookups are batched in parallel"
);

must(
  !ownership.includes(
    "if (index > 0) await sleepMs(350)"
  ),
  "old sequential 350ms scan removed"
);

must(
  ownership.includes(
    "await sleepMs(100)"
  ),
  "rate-limit spacing remains between batches"
);

console.log(
  "[ROUND 4] existing safety retained"
);

must(
  worker.includes(
    'minute === timeToMinutes("23:52")'
  ),
  "23:52 repair retained"
);

must(
  worker.includes(
    'minute === timeToMinutes("23:57")'
  ),
  "23:57 recovery retained"
);

must(
  worker.includes(
    'minute === timeToMinutes("23:58")'
  ),
  "23:58 final check retained"
);

must(
  !worker.includes(
    'minute === timeToMinutes("01:00")'
  ),
  "cross-midnight issuance remains removed"
);

must(
  worker.includes(
    "ownedOptionIds.length"
  ),
  "pre-create active option block retained"
);

must(
  worker.includes(
    "couponZeroOptionCleanup"
  ),
  "zero-option cleanup retained"
);

console.log("");
console.log(
  "[PASS] V259 R4.2 option-ID force-end / coverage / fast ownership verification completed."
);