import fs from "node:fs";

const app =
  fs.readFileSync(
    "apps/web/src/App.tsx",
    "utf8",
  );

const css =
  fs.readFileSync(
    "apps/web/src/style.css",
    "utf8",
  );

function must(ok, label) {
  if (!ok) {
    console.error("[FAIL] " + label);
    process.exitCode = 1;
  } else {
    console.log("[PASS] " + label);
  }
}

console.log("[ROUND 1] R5.9.20 hierarchy marker");

must(
  css.includes(
    "V259 R5.9.20 mobile flat hierarchy",
  ),
  "R5.9.20 marker exists",
);

must(
  css.includes(
    "V259 R5.9.19 mobile compact refinement",
  ),
  "R5.9.19 retained",
);


console.log("[ROUND 2] upper borders removed");

must(
  css.includes(
    ".adminplus-automation-card",
  ),
  "AdminPlus outer card override exists",
);

must(
  css.includes(
    ".adminplus-payment-policy-card",
  ),
  "payment policy outer override exists",
);

must(
  css.includes(
    ".inline-advanced-details",
  ),
  "advanced detail outer override exists",
);

must(
  css.includes(
    ".operation-exception-overview",
  ),
  "exception overview outer override exists",
);

must(
  css.includes(
    "border: 0 !important",
  ),
  "upper container borders are removed",
);


console.log("[ROUND 3] final content borders retained");

must(
  css.includes(
    ".automation-payment-compact tbody tr",
  ),
  "payment vendor rows retained as final cards",
);

must(
  css.includes(
    ".automation-account-compact tbody tr",
  ),
  "automation vendor rows retained as final cards",
);

must(
  css.includes(
    "border: 1px solid #dce4ee !important",
  ),
  "final content border retained",
);

must(
  css.includes(
    ".warning-box.compact-notice",
  ),
  "meaningful warning border retained",
);


console.log("[ROUND 4] actual App structure retained");

for (const needle of [
  'className="panel scheduler-panel"',
  'adminplus-automation-card',
  'adminplus-payment-policy-card',
  'automation-payment-compact',
  'automation-account-compact',
  'inline-advanced-details',
  'operation-exception-overview',
]) {
  must(
    app.includes(needle),
    needle + " retained",
  );
}


console.log("[ROUND 5] no business logic changes");

must(
  !css.includes("/api/"),
  "CSS has no API route",
);

must(
  !css.includes("scheduler/tick"),
  "CSS has no scheduler tick",
);

must(
  !css.includes("execute-payment"),
  "CSS has no payment execution",
);

if (!process.exitCode) {
  console.log(
    "[PASS] R5.9.20 mobile flat hierarchy verification completed.",
  );
}
