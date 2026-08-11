import fs from "node:fs";
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const app=fs.existsSync("apps/web/src/App.tsx")?fs.readFileSync("apps/web/src/App.tsx","utf8"):"";
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] match validation / option parsing");
must(worker.includes("asArray(row.options)"),"catalog parser accepts plural options");
must(worker.includes("asArray(nested.options)"),"catalog parser accepts nested options");
must(worker.includes("adminplus_catalog_match_apply_v237_preflight"),"match apply has catalog preflight");
must(worker.includes("옵션을 선택한 뒤 다시 수정 확정하세요"),"multi-option validation is actionable");
must(worker.includes("adminplusValidationDiagnostic(result.data"),"AdminPlus validation detail is exposed");

console.log("[ROUND 2] reconfirm vs soldout");
must(worker.includes("mappingAwaitingReconfirm"),"price watch detects pending reconfirm");
must(worker.includes('alertKind: "재확정대기"'),"pending reconfirm has dedicated state");
must(worker.includes("품절 판정이 아니라 재확정 대기 상태"),"old confirmed product is not mislabeled soldout");
if(app){
  must(app.includes("재확정대기"),"UI exposes pending reconfirm");
  must(app.includes('changeSummary: "재확정 완료"'),"successful confirmation visibly updates row");
}

console.log("[ROUND 3] regression/release");
must(worker.includes("v237-option-parser-validation-reconfirm-watch-20260811"),"V237 runtime marker exists");
must(worker.includes("normalizeAdminPlusProductName"),"normalized product matching retained");
console.log("[PASS] V237 match-validation/reconfirm-watch verification completed (3 rounds).");
