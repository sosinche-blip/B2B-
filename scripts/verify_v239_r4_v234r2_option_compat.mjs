import fs from "node:fs";
const app=fs.readFileSync("apps/web/src/App.tsx","utf8");
const v234r2=fs.readFileSync("scripts/verify_v234_r2_v218r1_verifier_compat.mjs","utf8");
const v218r1=fs.readFileSync("scripts/verify_v218r1_resolved_option_fix.mjs","utf8");
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] product-aware confirmed option preservation");
must(app.includes("const sameConfirmedProduct = Boolean("),"web compares new and confirmed product");
must(app.includes('(sameConfirmedProduct ? cleanId(confirmedLink?.optionCode) : "")'),"confirmed option is preserved only for unchanged product");

console.log("[ROUND 2] V234R2/V218R1 compatibility");
must(v234r2.includes("only when the selected product is unchanged"),"V234 R2 verifier accepts V239 product isolation");
must(v234r2.includes("current product-aware behavior"),"V234 R2 verifier accepts new V218R1 wording");
must(v218r1.includes("same-product confirmed-link"),"V218 R1 verifier uses product-aware option fallback");

console.log("[ROUND 3] current V239 safety");
must(app.includes('PRODUCT_CHANGE_OPTION_FIX_REVISION = "v239-product-change-option-leak-fix-20260811"'),"V239 product-change option fix retained");
must(app.includes("if (!effectiveOptionCode && resolvedOptionCode) effectiveOptionCode = resolvedOptionCode;"),"server-resolved option propagation retained");

console.log("[PASS] V239 R4 V234R2 option compatibility completed (3 rounds).");
