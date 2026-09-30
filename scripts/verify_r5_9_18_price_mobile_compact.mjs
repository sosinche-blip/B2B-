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

function must(value, label) {
  if (!value) {
    console.error("[FAIL] " + label);
    process.exitCode = 1;
  } else {
    console.log("[PASS] " + label);
  }
}

console.log("[ROUND 1] price alert");

must(
  app.includes(
    "v259-r5-9-18-price-mobile-compact",
  ),
  "R5.9.18 marker exists",
);

for (const word of [
  "상승",
  "하락",
  "품절",
  "재확인",
  "조회필요",
  "명칭변경",
]) {
  must(
    app.includes(word),
    "keyword exists: " + word,
  );
}

const priceAreaStart =
  app.indexOf(
    "openAdminPlusPriceAlerts.length > 0",
  );

const priceAreaEnd =
  priceAreaStart >= 0
    ? app.indexOf(
        "</section>",
        priceAreaStart,
      )
    : -1;

const priceArea =
  priceAreaStart >= 0 &&
  priceAreaEnd > priceAreaStart
    ? app.slice(
        priceAreaStart,
        priceAreaEnd,
      )
    : "";

must(
  priceArea.length > 0,
  "price alert area found",
);

must(
  !priceArea.includes(
    '"AdminPlus 현재상품"',
  ),
  "AdminPlus current-product column removed",
);

must(
  priceArea.includes(
    "adminPlusPriceAlertKeyword(row)",
  ),
  "compact notice keyword rendered",
);

console.log("[ROUND 2] payment compact");

must(
  app.includes(
    "automation-payment-compact",
  ),
  "payment compact class exists",
);

must(
  css.includes(
    "repeat(3, minmax(0, 1fr))",
  ),
  "payment is 3 columns x 2 rows",
);

console.log("[ROUND 3] account compact");

must(
  app.includes(
    "automation-account-compact",
  ),
  "account compact class exists",
);

must(
  css.includes(
    "repeat(6, minmax(0, 1fr))",
  ),
  "account layout uses 6 compact columns",
);

must(
  css.includes(
    "tbody td:nth-child(3)",
  ),
  "duplicate account display hidden on mobile",
);

console.log("[ROUND 4] previous UI retained");

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
    "V259 R5.9.17 operation mobile density polish",
  ),
  "R5.9.17 retained",
);

console.log("[ROUND 5] no backend change markers");

must(
  !app.includes(
    "v259-r5-9-18-worker-change",
  ),
  "no worker change marker",
);

must(
  !app.includes(
    "v259-r5-9-18-execute-payment",
  ),
  "no payment execution marker",
);

must(
  !app.includes(
    "v259-r5-9-18-execute-coupon",
  ),
  "no coupon execution marker",
);

if (!process.exitCode) {
  console.log(
    "[PASS] R5.9.18 verification completed.",
  );
}
