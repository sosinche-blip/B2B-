import fs from "node:fs";
const app=fs.readFileSync("apps/web/src/App.tsx","utf8");
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const pkg=JSON.parse(fs.readFileSync("package.json","utf8"));
let failed=0;
const check=(name,cond)=>{if(cond)console.log(`[PASS] ${name}`);else{console.error(`[FAIL] ${name}`);failed++;}};
console.log("[ROUND 1] manual new product mapping");
check("V256+ header version", /const\s+UI_RELEASE_REVISION\s*=\s*["\']V(?:25[6-9]|2[6-9]\d|[3-9]\d\d)[^"\']*["\']/.test(app));
check("V256 web marker", app.includes('v256-manual-mapping-nonapi-transition-20260817'));
check("V256 worker marker", worker.includes('v256-manual-mapping-nonapi-transition-20260817'));
check("manual new product UI exists", app.includes("수동 신규상품 추가") && app.includes("신규 상품 저장"));
check("real numeric marketplace optionId required", app.includes('/^\\d+$/.test(optionId)') && app.includes("실제 숫자 옵션ID"));
check("channel plus option duplicate blocked", app.includes("mappingServerKey(channel, optionId)") && app.includes("이미 상품매핑에 있습니다"));
check("manual row uses existing mapping persistence", app.includes("mappingsRef.current = next") && app.includes("1초 후 서버에 자동 저장"));
console.log("[ROUND 2] API to non-API vendor transition");
check("vendor blur transition hook", app.includes("commitMappingVendorTransition(row.id,event.currentTarget.value)"));
check("non-API transition removes confirmed link", app.includes("adminplusProductLinks.filter((row) => row.id !== linkId)"));
check("transition persists mappings and links together", app.includes("adminplusProductLinks: nextLinks") && app.includes("mappings: transitioned"));
check("old API product identity cleared", app.includes('vendorCode: "", vendorProductName: ""'));
check("operational values are not reset",
  app.includes('...row, vendorName, vendorCode: "", vendorProductName: "", matchAuthority: "excel" as const') &&
  !/commitMappingVendorTransition[\s\S]{0,2500}(baseQty|shippingFee|purchaseTime|cost):\s*(0|1|""|undefined)/.test(app)
);
check("old AdminPlus match cleanup is best effort", app.includes('/api/integrations/adminplus/catalog/matches/delete'));
check("API-to-API latest user confirmation wins safely",
  app.includes("같은 채널·옵션ID의 API상품매칭 표시도 최신 상품매칭 값으로 갱신합니다") &&
  app.includes("재확정 전까지 자동발주에서 제외합니다") &&
  app.includes("syncAdminPlusLinksFromLatestMappings") &&
  app.includes('matchAuthority: "excel" as const')
);
console.log("[ROUND 3] worker defensive routing");
check("worker no longer reverse-deletes link on vendor mismatch", !worker.includes("최신 엑셀에서 변경되어 기존 AdminPlus API 확정링크를 초기화했습니다"));
check("worker documents explicit non-API transition", worker.includes("API→비API 업체 전환은 웹에서 명시적으로 링크를 해제"));
check("purchase runtime skips vendor without AdminPlus account", worker.includes('reason: "어드민플러스 계정 미연결"'));
check("V255 source-of-truth retained", app.includes("v255-adminplus-link-status-fix-20260817") && worker.includes("v255-adminplus-link-status-fix-20260817"));
check("verify all adds V256", String(pkg.scripts?.["verify:all"]||"").includes("verify:v256"));
if(failed){console.error(`\n[FAIL] V256 verifier ${failed} checks failed.`);process.exit(1);}console.log("\n[PASS] V256 manual mapping/non-API transition verification completed.");
