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

function must(
  ok,
  label,
) {
  if (!ok) {
    console.error(
      "[FAIL] " + label,
    );
    process.exitCode = 1;
  } else {
    console.log(
      "[PASS] " + label,
    );
  }
}

console.log(
  "[ROUND 1] release marker / baseline",
);

must(
  css.includes(
    "V259 R5.9.19 mobile compact refinement",
  ),
  "R5.9.19 CSS marker exists",
);

must(
  css.includes(
    "V259 R5.9.18 price alerts + automation two-row mobile",
  ),
  "R5.9.18 CSS retained",
);

must(
  app.includes(
    "v259-r5-9-18-price-mobile-compact",
  ),
  "R5.9.18 App logic retained",
);


console.log(
  "[ROUND 2] today operation compact",
);

must(
  css.includes(
    ".operation-exception-grid",
  ),
  "exception grid override exists",
);

must(
  css.includes(
    ".operation-status-metrics",
  ),
  "operation status compact override exists",
);

must(
  css.includes(
    "repeat(2, minmax(0, 1fr)) !important",
  ),
  "two-column mobile layout exists",
);


console.log(
  "[ROUND 3] automation compact",
);

must(
  css.includes(
    ".automation-payment-compact tbody tr",
  ),
  "payment compact refinement exists",
);

must(
  css.includes(
    ".automation-account-compact tbody tr",
  ),
  "account compact refinement exists",
);

must(
  css.includes(
    "repeat(3, minmax(0, 1fr)) !important",
  ),
  "account table enlarged to readable three columns",
);


console.log(
  "[ROUND 4] table/card readability",
);

must(
  css.includes(
    "-webkit-line-clamp: 2",
  ),
  "two-line text clamp exists",
);

must(
  css.includes(
    "overflow-wrap: anywhere",
  ),
  "long IDs/text cannot break layout",
);

must(
  css.includes(
    "grid-column: 1 / -1",
  ),
  "long fields can use full row",
);


console.log(
  "[ROUND 5] business logic safety",
);

must(
  !css.includes(
    "/api/",
  ),
  "CSS contains no API route",
);

must(
  !css.includes(
    "scheduler/tick",
  ),
  "CSS contains no scheduler tick",
);

must(
  !css.includes(
    "execute-payment",
  ),
  "CSS contains no payment execution",
);

if (!process.exitCode) {
  console.log(
    "[PASS] R5.9.19 mobile compact refinement verification completed.",
  );
}
