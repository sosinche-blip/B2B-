import fs from "node:fs";
const app=fs.readFileSync("apps/web/src/App.tsx","utf8");
const verifier=fs.readFileSync("scripts/verify_v218r1_resolved_option_fix.mjs","utf8");
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] V234 option fallback");
must(app.includes("let effectiveOptionCode = cleanId(suggestion.optionCode) || cleanId(confirmedLink?.optionCode);"),"confirmed-link option is preserved before catalog lookup");
must(app.includes("if (option?.optionCode) effectiveOptionCode = option.optionCode;"),"fresh catalog option can override preserved fallback");
must(app.includes("if (!effectiveOptionCode && resolvedOptionCode) effectiveOptionCode = resolvedOptionCode;"),"server-resolved option still fills a blank option");

console.log("[ROUND 2] legacy V218 R1 verifier compatibility");
must(verifier.includes("confirmed-link"),"V218 R1 verifier recognizes confirmed-link fallback");
must(verifier.includes("UI-selected, confirmed-link, or server-resolved"),"V218 R1 verifier message reflects current behavior");

console.log("[ROUND 3] V234 behavior retained");
must(app.includes("tentativeMatchChanged && !product"),"time-only edit catalog bypass remains");
must(app.includes('PRICE_REFRESH_REVISION = "v234-time-edit-soldout-price-refresh-20260811"'),"V234 release marker retained");

console.log("[PASS] V234 R2 V218 R1 verifier compatibility completed (3 rounds).");
