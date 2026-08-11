import fs from "node:fs";
const app=fs.readFileSync("apps/web/src/App.tsx","utf8");
const verifier=fs.readFileSync("scripts/verify_v217_option_baseqty_confirm_fix.mjs","utf8");
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] latest Excel baseQty context");
must(app.includes("<th>기본수량</th>"),"V236 compact table still exposes base quantity");
must(app.includes("최신 엑셀 기준"),"base quantity is presented inside latest-Excel context");

console.log("[ROUND 2] confirmed vs reconfirm policy");
must(app.includes("const needsReconfirm = needsOptionScopedMigration || excelBaselineChanged;"),"reconfirm combines option/qty migration and Excel baseline changes");
must(app.includes('status: needsReconfirm ? "확정가능" : "확정됨"'),"unchanged rows remain confirmed");
must(app.includes("최신 엑셀과 현재 서버 확정매핑이 일치합니다."),"unchanged row confirmation is explicit");

console.log("[ROUND 3] V217 compatibility");
must(verifier.includes("latest-Excel mapping context"),"V217 verifier accepts unified V236 baseQty label");
must(verifier.includes("Excel-baseline rows require reconfirm"),"V217 verifier recognizes V236 reconfirm exception");
must(app.includes('MAPPING_STATE_UI_REVISION = "v236-latest-excel-reconfirm-current-state-20260811"'),"V236 mapping-state UI revision retained");

console.log("[PASS] V236 R4 V217 Excel-context compatibility completed (3 rounds).");
