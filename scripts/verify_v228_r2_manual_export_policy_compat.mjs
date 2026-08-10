import fs from "node:fs";
const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const verifier = fs.readFileSync("scripts/verify_v209_adminplus_product_price.mjs", "utf8");
const must=(ok,msg)=>{if(!ok) throw new Error(msg); console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] default API/manual separation");
must(app.includes('const apiAutoRows = targetRows.filter((row) => isAdminPlusAutoPurchaseVendor(row.vendorName))'), "API-linked vendors are still identified separately");
must(app.includes(': targetRows.filter((row) => !isAdminPlusAutoPurchaseVendor(row.vendorName))'), "default manual export still excludes API-linked vendors");

console.log("[ROUND 2] explicit selected-order fallback");
must(app.includes('includeAdminPlusLinkedForManual?: boolean'), "manual-export override is explicit");
must(app.includes('const manualTargetRows = options.includeAdminPlusLinkedForManual'), "override affects only opted-in export");
must(app.includes('includeAdminPlusLinkedForManual: true'), "selected-order collection opts into fallback");
must(app.includes('AdminPlus API 연동상품도 명시적으로 선택한 경우 수동 발주파일에 포함'), "operator sees fallback behavior");

console.log("[ROUND 3] legacy verifier compatibility");
must(verifier.includes('permits explicit selected API fallback'), "V209 verifier follows V228 policy");
must(!verifier.includes("manual export keeps non-API vendors'),"), "obsolete absolute manual-only assertion removed");
must(app.includes('automation-persist-selected-manual-v228-20260810') || app.includes('includeAdminPlusLinkedForManual'), "V228 selected-manual behavior retained");

console.log("[PASS] V228 R2 manual-export policy compatibility completed (3 rounds).");
