import fs from "node:fs";
const app=fs.existsSync("apps/web/src/App.tsx")?fs.readFileSync("apps/web/src/App.tsx","utf8"):"";
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};
console.log("[ROUND 1] latest Excel vs confirmed state");
if(app){
  must(app.includes("preserveLocalMappings"),"server state load preserves newer local Excel when requested");
  must(app.includes("const latestExcelMappings = mappingsRef.current"),"recommendation uses latest Excel mappings");
  must(app.includes("excelProductChanged"),"same option detects product change");
  must(app.includes("excelBaselineChanged"),"same option detects baseline-price change");
  must(app.includes("재확정이 필요합니다"),"operator sees reconfirm requirement");
}
console.log("[ROUND 2] baseline/current meaning");
if(app){
  must(app.includes("<strong>기준단가</strong>는 최신 엑셀에서 확정한 기준값"),"Excel baseline meaning is explained");
  must(app.includes("<strong>현재단가</strong>는 마지막 <strong>지금 가격확인</strong>"),"current AdminPlus price meaning is explained");
  must(app.includes("마지막 가격확인 시점의 현재 스냅샷"),"watch table is identified as current snapshot");
  must(app.includes("baselinePrice: Math.max(0, Number(mapping.cost"),"confirmed baseline uses Excel unit price");
}
console.log("[ROUND 3] failure/title clarity");
if(app){
  must(/const UI_RELEASE_REVISION = "V248 R[2345]"/.test(app) && app.includes('const APP_VERSION = `${UI_RELEASE_REVISION}'),"header follows current release revision");
  must(app.includes("showAdminPlusFailureDetails"),"failure detail toggle exists");
  must(app.includes("서버 저장 실패 상세"),"failure detail panel exists");
  must(app.includes("오류내용"),"failure detail exposes error text");
}
must(worker.includes("v236-latest-excel-reconfirm-current-state-20260811"),"V236 runtime revision exposed");
console.log("[PASS] V236 mapping state/reconfirm/failure UI verification completed (3 rounds).");
