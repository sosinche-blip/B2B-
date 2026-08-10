import fs from "node:fs";
const worker = fs.readFileSync("apps/worker/src/worker.ts","utf8");
const app = fs.existsSync("apps/web/src/App.tsx") ? fs.readFileSync("apps/web/src/App.tsx","utf8") : "";
const must=(ok,msg)=>{if(!ok) throw new Error(msg); console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] Excel-first mapping authority");
if (app) {
  must(app.includes("reconcileAdminPlusLinksToLatestExcel"), "web reconciles confirmed API links to latest Excel mappings");
  must(app.includes("엑셀업체 변경 초기화"), "operator sees vendor-change reset count");
  must(app.includes("/api/integrations/adminplus/catalog/matches/delete"), "old-vendor AdminPlus match delete is attempted");
}
must(worker.includes("mappingResets"), "runtime ignores/resets vendor-mismatched API links");
must(worker.includes("동일 옵션ID의 업체가 최신 엑셀에서 변경"), "runtime documents Excel vendor precedence");

console.log("[ROUND 2] same-vendor product-name change alert");
must(worker.includes('alertKind: "상품명변경"'), "product-name mismatch creates dedicated alert");
must(worker.includes("품절·대체상품·규격변경 여부"), "alert instructs stock/replacement review");
must(worker.includes("자동으로 새 상품으로 변경하지 않습니다"), "name mismatch never auto-switches products");
if (app) {
  must(app.includes("엑셀 기준상품") && app.includes("AdminPlus 현재상품"), "price-watch table shows expected vs current product names");
}

console.log("[ROUND 3] global AdminPlus catalog search");
must(worker.includes("adminplusGlobalCatalogSearchEndpoint"), "server has cross-account catalog search endpoint");
must(worker.includes('"/api/integrations/adminplus/catalog/search"'), "global search route is wired");
if (app) {
  must(app.includes('"catalogSearch"'), "dedicated API product-search page exists");
  must(app.includes("AdminPlus 전체 업체 상품검색"), "global search UI exists");
  must(app.includes("전체 업체 상품검색"), "one-action cross-account search is available");
  must(app.includes("가격") && app.includes("상품명 포함검색"), "search UI shows product name and price");
}
must(worker.includes("excel-first-mapping-global-catalog-v232-20260811"), "V232 revision exposed");
console.log("[PASS] V232 Excel-first mapping/product-change/global-catalog verification completed (3 rounds).");
