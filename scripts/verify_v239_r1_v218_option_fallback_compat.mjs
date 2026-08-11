import fs from "node:fs";
const app=fs.readFileSync("apps/web/src/App.tsx","utf8");
const verifier=fs.readFileSync("scripts/verify_v218_single_adminplus_option_fix.mjs","utf8");
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] same-product confirmed option fallback");
must(app.includes("const sameConfirmedProduct = Boolean("),"web compares confirmed and selected product");
must(app.includes('(sameConfirmedProduct ? cleanId(confirmedLink?.optionCode) : "")'),"old confirmed option is reused only when product is unchanged");

console.log("[ROUND 2] fresh option resolution");
must(app.includes("if (option?.optionCode) effectiveOptionCode = option.optionCode;"),"catalog-selected option remains authoritative");
must(app.includes("if (!effectiveOptionCode && resolvedOptionCode) effectiveOptionCode = resolvedOptionCode;"),"Ncloud-resolved option still fills a blank option");

console.log("[ROUND 3] V218/V239 policy");
must(verifier.includes("same-product confirmed-link"),"V218 verifier recognizes product-change option isolation");
must(app.includes('PRODUCT_CHANGE_OPTION_FIX_REVISION = "v239-product-change-option-leak-fix-20260811"'),"V239 option-leak fix remains active");

console.log("[PASS] V239 R1 V218 option-fallback compatibility completed (3 rounds).");
