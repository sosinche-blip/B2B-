import fs from "node:fs";
const app=fs.readFileSync("apps/web/src/App.tsx","utf8");
const verifier=fs.readFileSync("scripts/verify_v211_shipping_baseqty_cost.mjs","utf8");
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] compact AdminPlus fields");
must(app.includes('className="compact-api-field">기본수량<input'),"compact AdminPlus baseQty field exists");
must(app.includes('className="compact-api-field">배송비(원)<input'),"compact AdminPlus shipping fee field exists");

console.log("[ROUND 2] configured-cost semantics");
must(app.includes("기준구성원가"),"V235 uses 기준구성원가 terminology");
must(app.includes("기준단가 × 기본수량 + 배송비"),"V235 explains configured-cost formula in Excel terms");
must(verifier.includes("기준구성원가는 기준단가 × 기본수량 + 배송비") || verifier.includes("기준구성원가"),"V211 verifier accepts V235 formula wording");

console.log("[ROUND 3] release");
must(app.includes('EXCEL_SCHEMA_UI_REVISION = "v235-excel-schema-ui-catalog-review-20260811"'),"V235 UI revision retained");
must(app.includes('className="mapping-master-table"'),"Excel-schema mapping table retained");

console.log("[PASS] V235 R3 V211 verifier compatibility completed (3 rounds).");
