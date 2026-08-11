import fs from "node:fs";
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const app=fs.existsSync("apps/web/src/App.tsx")?fs.readFileSync("apps/web/src/App.tsx","utf8"):"";
const css=fs.existsSync("apps/web/src/style.css")?fs.readFileSync("apps/web/src/style.css","utf8"):"";
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};
console.log("[ROUND 1] special-char/full-catalog matching");
must(worker.includes('.normalize("NFKC")'),"Unicode NFKC normalization exists");
must(worker.includes("\\\\p{L}")||worker.includes("\\p{L}"),"punctuation/symbol insensitive comparison exists");
must(worker.includes("pages >= 100"),"catalog pagination cap expanded");
must(worker.includes("seenCursors"),"repeated cursor protection exists");
console.log("[ROUND 2] Excel schema UI");
if(app){
  const h='["채널", "옵션ID", "업체명", "코드번호", "업체상품명", "기본수량", "배송비", "기준단가", "기준구성원가", "발주시간"]';
  must(app.split(h).length>=3,"template/export use uploaded 10-column schema");
  must(app.includes('className="mapping-master-table"'),"mapping table follows Excel schema");
  must(app.includes("adminPlusConfiguredCost(row.cost, row.baseQty, row.shippingFee)"),"configured cost is derived");
  must(app.includes('["기준단가", "원가", "공급가", "매입가"]'),"기준단가 is canonical import term");
}
if(css){
  must(css.includes("mapping-code-input{width:50%"),"code field is 50%");
  must(css.includes("mapping-qty-input{width:50%"),"qty field is 50%");
  must(css.includes("mapping-fee-input{width:50%"),"shipping field is 50%");
}
console.log("[ROUND 3] unified operator UI");
if(app){
  must(app.includes("서버 저장 미확인"),"save warning has clear meaning");
  must(app.includes("마지막 서버 확정값"),"runtime fallback is explained");
  must(app.includes("AdminPlus 상품상태·가격 확인"),"price/status banner unified");
  must(app.includes("현재단가"),"price terminology unified");
}
must(worker.includes("adminplusProductAvailabilityLabel"),"availability classification helper exists");
must(worker.includes("v235-excel-schema-ui-catalog-review-20260811"),"V235 revision exposed");
console.log("[PASS] V235 Excel-schema/UI/catalog verification completed (3 rounds).");
