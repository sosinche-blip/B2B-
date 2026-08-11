import fs from "node:fs";
const app=fs.readFileSync("apps/web/src/App.tsx","utf8");
const verifier=fs.readFileSync("scripts/verify_v213_per_option_payment_toss.mjs","utf8");
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] V236 reconfirm table");
must(app.includes("<th>옵션ID</th><th>재확정 상태</th><th>발주시간</th>"),"V236 table shows optionId then reconfirm state then schedule");
must(app.includes("재확정 필요"),"V236 exposes reconfirm-needed state");

console.log("[ROUND 2] V213 compatibility");
must(verifier.includes("confirmation/reconfirmation state"),"V213 verifier accepts new reconfirm-state UI");
must(verifier.includes("재확정 상태"),"V213 verifier recognizes V236 header");

console.log("[ROUND 3] regression");
must(app.includes("parseOptionPurchaseTimes"),"per-option purchase time parsing retained");
must(app.includes('MAPPING_STATE_UI_REVISION = "v236-latest-excel-reconfirm-current-state-20260811"'),"V236 UI revision retained");

console.log("[PASS] V236 R1 V213 reconfirm-table compatibility completed (3 rounds).");
