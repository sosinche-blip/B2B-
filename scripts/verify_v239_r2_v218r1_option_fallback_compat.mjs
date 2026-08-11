import fs from "node:fs";
const app=fs.readFileSync("apps/web/src/App.tsx","utf8");
const verifier=fs.readFileSync("scripts/verify_v218r1_resolved_option_fix.mjs","utf8");
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] product-aware option fallback");
must(app.includes("const sameConfirmedProduct = Boolean("),"web compares new product with confirmed product");
must(app.includes('(sameConfirmedProduct ? cleanId(confirmedLink?.optionCode) : "")'),"confirmed option fallback is same-product only");

console.log("[ROUND 2] resolved option propagation");
must(app.includes("if (option?.optionCode) effectiveOptionCode = option.optionCode;"),"catalog-resolved option remains supported");
must(app.includes("if (!effectiveOptionCode && resolvedOptionCode) effectiveOptionCode = resolvedOptionCode;"),"server-resolved option remains supported");
must(verifier.includes("same-product confirmed-link"),"V218R1 verifier recognizes product-aware fallback");

console.log("[ROUND 3] V239 safety retained");
must(app.includes('PRODUCT_CHANGE_OPTION_FIX_REVISION = "v239-product-change-option-leak-fix-20260811"'),"V239 product-change option isolation remains active");

console.log("[PASS] V239 R2 V218R1 option-fallback compatibility completed (3 rounds).");
