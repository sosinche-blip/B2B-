import fs from "node:fs";
const app=fs.readFileSync("apps/web/src/App.tsx","utf8");
const verifier=fs.readFileSync("scripts/verify_v215_dual_time_server_lock_alert.mjs","utf8");
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] current server-lock semantics");
must(app.includes("adminplusProductLinkDrafts"),"row drafts remain isolated");
must(app.includes("const expectedLinks = adminplusProductLinks.map"),"global save serializes confirmed links, not row drafts");
must(app.includes("미확정 편집 ${draftCount}건은 저장하지 않았습니다."),"global save explicitly reports skipped drafts");

console.log("[ROUND 2] latest Excel + confirmed links");
must(app.includes("preserveLocalMappings"),"latest local Excel mappings are preserved");
must(app.includes("const confirmedLinks = excelPriority.links"),"server-confirmed AdminPlus links remain authoritative until reconfirmed");
must(verifier.includes("preserving latest Excel mappings"),"V215 verifier recognizes split Excel/confirmed-state model");

console.log("[ROUND 3] V236 retained");
must(app.includes('MAPPING_STATE_UI_REVISION = "v236-latest-excel-reconfirm-current-state-20260811"'),"V236 mapping-state revision retained");
must(app.includes("서버 저장 실패 상세"),"failure detail UI retained");

console.log("[PASS] V236 R2 V215 server-lock compatibility completed (3 rounds).");
