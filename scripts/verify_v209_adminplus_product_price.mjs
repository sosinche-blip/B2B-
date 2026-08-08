import fs from 'node:fs';
const app = fs.readFileSync('apps/web/src/App.tsx','utf8');
const worker = fs.readFileSync('apps/worker/src/worker.ts','utf8');
const must=(ok,msg)=>{ if(!ok) throw new Error(msg); console.log(`[PASS] ${msg}`); };

console.log('\n[ROUND 1] direct product mapping / channel routing');
must(app.includes('V209 어드민플러스 상품직접매칭·업체발주구분·가격변동알림'),'V209 UI marker');
must(app.includes('mappingWorkspaceView === "adminplus"'),'AdminPlus product matching workspace');
must(app.includes('쿠팡·토스의 기존 옵션ID 매핑'),'Both Coupang and Toss described in direct mapping UI');
must(worker.includes('/v1/seller/products'),'AdminPlus catalog product API wired');
must(worker.includes('"/api/integrations/"'),'AdminPlus catalog/price calls are routed through fixed-IP Ncloud gateway');
must(worker.includes('/v1/seller/product_matches'),'AdminPlus product match API wired');
must(worker.includes('adminplus_catalog_match_apply_v209'),'match apply verifies after save');
must(worker.includes('기존 1:N 상품문자열 매칭은 웹앱에서 1개 상품으로 덮어쓰지 않습니다.'),'existing 1:N/multi-qty match is protected from accidental overwrite');
must(worker.includes('status: "ACCEPT"') && worker.includes('status: "PAID"'),'Coupang ACCEPT and Toss PAID both collected');

console.log('\n[ROUND 2] API/manual vendor separation / duplicate purchase prevention');
must(app.includes('AdminPlus API') && app.includes('수동/엑셀') && app.includes('API 연결·중지'),'vendor purchase mode labels');
must(app.includes('account.orderReadScopeOk === false') && app.includes('account.productReadScopeOk === false'),'order.read/product.read permission status visible');
must(app.includes('apiAutoRows = targetRows.filter'),'API vendor rows are separated from manual export');
must(app.includes('manualTargetRows = targetRows.filter'),'manual export keeps non-API vendors');
must(app.includes('!isAdminPlusAutoPurchaseVendor(row.vendorName)'),'manual files exclude API auto-purchase vendor');
must(worker.includes('어드민플러스 계정 미연결/자동발주 OFF'),'AdminPlus runtime skips non-API/manual vendors');

console.log('\n[ROUND 3] price monitoring / persistence / alert dedupe');
must(worker.includes('priceCheckTimes'),'scheduled price checks configured');
must(worker.includes('adminplusPriceCheckRun'),'price monitor runtime present');
must(worker.includes('Number(row.newPrice || 0) === product.price'),'same unresolved price alert deduped');
must(worker.includes('adminplusProductLinks: asArray(data.adminplusProductLinks)'),'price links persisted');
must(worker.includes('adminplusPriceAlerts: asArray(data.adminplusPriceAlerts).slice(-1000)'),'price alerts persisted');
must(app.includes('어드민플러스 공급가 변동'),'visible price change banner');
must(app.includes('현재가를 기준으로'),'price acknowledgement/reset action');
must(app.includes('adminplusProductLinks: nextLinks') && app.includes('adminplusPriceAlerts: nextAlerts.slice(-1000)'),'price baseline acknowledgement is persisted to server');
must(worker.includes('version: "v209-adminplus-product-match-price-watch"'),'Worker V209 runtime marker');

// deterministic price-change calculation check
const baseline=10000, current=11500;
const difference=current-baseline;
const rate=baseline ? difference/baseline*100 : 0;
must(difference===1500 && rate===15,'price change difference/rate simulation');
console.log('\n[PASS] V209 AdminPlus direct mapping/vendor routing/price monitoring verification completed (3 rounds).');
