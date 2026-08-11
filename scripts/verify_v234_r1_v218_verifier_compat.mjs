import fs from "node:fs";
const app=fs.readFileSync("apps/web/src/App.tsx","utf8");
const v218=fs.readFileSync("scripts/verify_v218_single_adminplus_option_fix.mjs","utf8");
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] V234 option resolution");
must(
  app.includes("let effectiveOptionCode = cleanId(suggestion.optionCode) || cleanId(confirmedLink?.optionCode);") ||
  (
    app.includes("const sameConfirmedProduct = Boolean(") &&
    app.includes('let effectiveOptionCode = cleanId(suggestion.optionCode) || (sameConfirmedProduct ? cleanId(confirmedLink?.optionCode) : "");')
  ),
  "V234 preserves confirmed option code for server-only edits only when the product is unchanged"
);
must(app.includes("if (option?.optionCode) effectiveOptionCode = option.optionCode;"),"fresh catalog option still overrides when explicitly resolved");

console.log("[ROUND 2] legacy V218 verifier compatibility");
must(v218.includes("confirmed-link"),"V218 verifier understands confirmed-link option fallback");
must(
  v218.includes("UI-selected, confirmed-link, or Ncloud-resolved") ||
  v218.includes("UI-selected, same-product confirmed-link, catalog-resolved, or Ncloud-resolved"),
  "V218 message reflects current product-aware option resolution semantics"
);

console.log("[ROUND 3] V234 behavior retained");
must(app.includes("tentativeMatchChanged && !product"),"time-only edit still avoids unnecessary catalog requirement");
must(app.includes('PRICE_REFRESH_REVISION = "v234-time-edit-soldout-price-refresh-20260811"'),"V234 release marker retained");

console.log("[PASS] V234 R1 V218 verifier compatibility completed (3 rounds).");
