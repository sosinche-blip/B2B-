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
  "[ROUND 1] R5.9.16 routing",
);

must(
  app.includes(
    "v259-r5-9-16-exception-detail-actions",
  ),
  "R5.9.16 marker exists",
);

must(
  app.includes(
    'setMappingWorkspaceView("purchase")',
  ),
  "purchase/address route to purchase workspace",
);

must(
  app.includes(
    'setMappingWorkspaceView("adminplus")',
  ),
  "price route to AdminPlus workspace",
);

must(
  app.includes(
    'setActiveMenu("쿠폰관리")',
  ),
  "coupon route uses valid coupon menu",
);

must(
  app.includes(
    "void refreshOperationControl();",
  ),
  "operational failure uses read-only refresh",
);

console.log(
  "[ROUND 2] action labels",
);

for (const label of [
  "발주관리에서 확인",
  "현재상태 다시 확인",
  "발주관리에서 주소 확인",
  "API 상품매칭에서 확인",
  "쿠폰관리에서 확인",
]) {
  must(
    app.includes(label),
    label,
  );
}

console.log(
  "[ROUND 3] R5.9.15 retained",
);

must(
  app.includes(
    "v259-r5-9-15-exception-card-detail-navigation",
  ),
  "R5.9.15 detail navigation retained",
);

must(
  app.includes(
    'id="operation-exception-detail"',
  ),
  "detail panel retained",
);

must(
  app.includes(
    'openOperationExceptionDetail("purchase")',
  ),
  "interactive cards retained",
);

console.log(
  "[ROUND 4] styling",
);

must(
  css.includes(
    "V259 R5.9.16 exception detail action shortcuts",
  ),
  "R5.9.16 CSS exists",
);

must(
  css.includes(
    ".operation-exception-detail-actions",
  ),
  "action layout exists",
);

console.log(
  "[ROUND 5] no execution wiring",
);

must(
  !app.includes(
    "v259-r5-9-16-purchase-run",
  ),
  "no purchase execution added",
);

must(
  !app.includes(
    "v259-r5-9-16-payment-run",
  ),
  "no payment execution added",
);

must(
  !app.includes(
    "v259-r5-9-16-coupon-run",
  ),
  "no coupon execution added",
);

if (!process.exitCode) {
  console.log(
    "[PASS] R5.9.16 exception action shortcuts verification completed.",
  );
}
