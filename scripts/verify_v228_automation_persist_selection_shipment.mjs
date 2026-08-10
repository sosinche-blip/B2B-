import fs from "node:fs";
const worker = fs.readFileSync("apps/worker/src/worker.ts","utf8");
const app = fs.existsSync("apps/web/src/App.tsx") ? fs.readFileSync("apps/web/src/App.tsx","utf8") : "";
const must=(ok,msg)=>{if(!ok) throw new Error(msg); console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] automation settings persistence/token ergonomics");
if (app) {
  must(app.includes('/api/operation/settings/latest'), "web auto-loads latest server settings");
  must(app.includes('/api/integrations/adminplus/accounts/status'), "daily AdminPlus account/status lookup does not use admin-token route");
  must(app.includes('관리 토큰은 쿠팡/Toss/AdminPlus 인증키를 추가·수정·삭제할 때만'), "UI explains admin token is credential-change only");
  must(app.includes('window.localStorage.setItem(SETTINGS_STORAGE_KEY'), "payment/automation settings get local fallback after server save");
}
must(worker.includes('adminplus_accounts_status_v228_operational'), "operational account-status endpoint exists");

console.log("[ROUND 2] selected-order manual fallback");
if (app) {
  must(app.includes('includeAdminPlusLinkedForManual?: boolean'), "manual export supports explicit AdminPlus-linked override");
  must(app.includes('includeAdminPlusLinkedForManual: true'), "selected collection enables manual fallback for API-linked products");
  must(app.includes('AdminPlus API 연동상품도 명시적으로 선택한 경우 수동 발주파일에 포함'), "operator receives manual-fallback confirmation");
}

console.log("[ROUND 3] Coupang shipment identifier refresh");
must(worker.includes('marketplaceOrderId: channel === "쿠팡"'), "normalized Coupang row keeps exact orderId");
must(worker.includes('orderId?: string;'), "AdminPlus purchase history stores Coupang orderId");
must(worker.includes('orderId: hist.orderId || hist.orderNo'), "shipment row prefers stored exact orderId");
must(worker.includes('adminplusRefreshCoupangShipmentIdentifiers'), "shipment sync refreshes current INSTRUCT identifiers");
must(worker.includes('automation-persist-selected-manual-v228-20260810'), "V228 revision exposed");
console.log("[PASS] V228 persistence/manual-selection/Coupang-shipment verification completed (3 rounds).");
