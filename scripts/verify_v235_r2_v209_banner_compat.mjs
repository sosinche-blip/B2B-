import fs from "node:fs";
const app=fs.readFileSync("apps/web/src/App.tsx","utf8");
const verifier=fs.readFileSync("scripts/verify_v209_adminplus_product_price.mjs","utf8");
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] V235 unified banner");
must(app.includes("AdminPlus 상품상태·가격 확인"),"new unified product-status/price banner exists");
must(app.includes("품절/판매중지"),"banner includes availability issues");
must(app.includes("상품명변경"),"banner includes product-name issues");

console.log("[ROUND 2] V209 compatibility");
must(verifier.includes("AdminPlus 상품상태·가격 확인"),"V209 verifier accepts unified banner wording");
must(verifier.includes("visible price/status change banner"),"V209 verifier message reflects widened semantics");

console.log("[ROUND 3] V235 behavior retained");
must(app.includes('EXCEL_SCHEMA_UI_REVISION = "v235-excel-schema-ui-catalog-review-20260811"'),"V235 UI revision retained");
must(app.includes('className="mapping-master-table"'),"Excel-schema mapping table retained");

console.log("[PASS] V235 R2 V209 banner compatibility completed (3 rounds).");
