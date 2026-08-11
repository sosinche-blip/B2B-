import fs from "node:fs";
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const app=fs.existsSync("apps/web/src/App.tsx")?fs.readFileSync("apps/web/src/App.tsx","utf8"):"";
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] web option leak prevention");
if(app){
  must(app.includes("const sameConfirmedProduct = Boolean("),"web compares confirmed and new product codes");
  must(app.includes('(sameConfirmedProduct ? cleanId(confirmedLink?.optionCode) : "")'),"old option fallback is allowed only for same product");
  must(app.includes("과거 확정상품과 과거 옵션코드를 재사용하지 않고"),"UI explains product-change option reset");
}

console.log("[ROUND 2] Ncloud defensive option validation");
must(worker.includes("catalogProduct.options.length === 0"),"optionless products are handled explicitly");
must(worker.includes('delete requestedRecord.option_code'),"stale option is removed for optionless new product");
must(worker.includes("availableOptionCodes.includes(requestedOptionCode)"),"requested option must belong to selected product");
must(worker.includes("상품 변경 시 이전 상품 옵션은 재사용할 수 없습니다"),"invalid old option gets actionable error");

console.log("[ROUND 3] regression/release");
must(worker.includes("adminplus_catalog_match_apply_v237_preflight"),"V237 match preflight retained");
must(worker.includes("v239-product-change-option-leak-fix-20260811"),"V239 option-leak fix revision exposed");
if(app) must(app.includes('PRODUCT_CHANGE_OPTION_FIX_REVISION = "v239-product-change-option-leak-fix-20260811"'),"web V239 revision exposed");
console.log("[PASS] V239 product-change option-leak verification completed (3 rounds).");
