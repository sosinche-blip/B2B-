import fs from "node:fs";
const app=fs.readFileSync("apps/web/src/App.tsx","utf8");
const v234r1=fs.readFileSync("scripts/verify_v234_r1_v218_verifier_compat.mjs","utf8");
const v218=fs.readFileSync("scripts/verify_v218_single_adminplus_option_fix.mjs","utf8");
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] product-aware server-only edit");
must(app.includes("const sameConfirmedProduct = Boolean("),"web compares current and confirmed products");
must(app.includes('(sameConfirmedProduct ? cleanId(confirmedLink?.optionCode) : "")'),"confirmed option survives only for unchanged product");

console.log("[ROUND 2] legacy verifier chain");
must(v234r1.includes("only when the product is unchanged"),"V234 R1 verifier accepts V239 product isolation");
must(v234r1.includes("product-aware option resolution semantics"),"V234 R1 verifier accepts new V218 wording");
must(v218.includes("same-product confirmed-link"),"V218 verifier uses product-aware fallback wording");

console.log("[ROUND 3] current release safety");
must(app.includes('PRODUCT_CHANGE_OPTION_FIX_REVISION = "v239-product-change-option-leak-fix-20260811"'),"V239 option leak fix retained");
must(app.includes("if (!effectiveOptionCode && resolvedOptionCode) effectiveOptionCode = resolvedOptionCode;"),"resolved option propagation retained");

console.log("[PASS] V239 R3 V234R1 compatibility completed (3 rounds).");
