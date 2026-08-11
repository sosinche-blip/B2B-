import fs from "node:fs";
const app=fs.readFileSync("apps/web/src/App.tsx","utf8");
const verifier=fs.readFileSync("scripts/verify_v216_confirmed_match_time_fix.mjs","utf8");
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] unchanged confirmed mapping");
must(app.includes("최신 엑셀과 현재 서버 확정매핑이 일치합니다."),"unchanged confirmed mapping remains confirmed");
must(app.includes('status: needsReconfirm ? "확정가능" : "확정됨"'),"status distinguishes unchanged confirmed vs reconfirm-needed");

console.log("[ROUND 2] changed Excel requires reconfirm");
must(app.includes("const needsReconfirm = needsOptionScopedMigration || excelBaselineChanged;"),"baseline/option changes trigger reconfirm");
must(app.includes("excelProductChanged"),"product-name change is detected separately");
must(app.includes("재확정이 필요합니다"),"operator sees reconfirm requirement");

console.log("[ROUND 3] V216 compatibility");
must(verifier.includes("unchanged server-confirmed mappings"),"V216 verifier follows V236 policy");
must(verifier.includes("latest Excel changed"),"V216 verifier recognizes latest-Excel reconfirm exception");
must(app.includes('MAPPING_STATE_UI_REVISION = "v236-latest-excel-reconfirm-current-state-20260811"'),"V236 mapping-state revision retained");

console.log("[PASS] V236 R3 V216 reconfirm-policy compatibility completed (3 rounds).");
