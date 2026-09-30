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
  value,
  label,
) {
  if (!value) {
    console.error("[FAIL] " + label);
    process.exitCode = 1;
  } else {
    console.log("[PASS] " + label);
  }
}

console.log(
  "[ROUND 1] R5.9.17 CSS marker",
);

must(
  css.includes(
    "V259 R5.9.17 operation mobile density polish",
  ),
  "R5.9.17 CSS marker exists",
);

console.log(
  "[ROUND 2] desktop density",
);

must(
  css.includes(
    ".operation-exception-card",
  ),
  "exception card density rules exist",
);

must(
  css.includes(
    "min-height: 92px",
  ),
  "desktop exception cards reduced",
);

must(
  css.includes(
    "overflow-x: auto",
  ),
  "wide detail table scroll is protected",
);

console.log(
  "[ROUND 3] mobile layout",
);

must(
  css.includes(
    "@media (max-width: 640px)",
  ),
  "mobile breakpoint exists",
);

must(
  css.includes(
    "@media (max-width: 420px)",
  ),
  "small-phone breakpoint exists",
);

must(
  css.includes(
    "grid-template-columns: 1fr 1fr",
  ),
  "mobile detail actions use two-column layout",
);

console.log(
  "[ROUND 4] previous UI retained",
);

for (const marker of [
  "v259-r5-9-14-operation-exception-dashboard",
  "v259-r5-9-15-exception-card-detail-navigation",
  "v259-r5-9-16-exception-detail-actions",
]) {
  must(
    app.includes(marker),
    marker + " retained",
  );
}

must(
  css.includes(
    "V259 R5.9.15 exception card detail navigation",
  ),
  "R5.9.15 styling retained",
);

must(
  css.includes(
    "V259 R5.9.16 exception detail action shortcuts",
  ),
  "R5.9.16 styling retained",
);

console.log(
  "[ROUND 5] CSS-only safety",
);

must(
  !css.includes(
    "/api/",
  ),
  "R5.9.17 CSS contains no API wiring",
);

if (!process.exitCode) {
  console.log(
    "[PASS] R5.9.17 mobile/density verification completed.",
  );
}
