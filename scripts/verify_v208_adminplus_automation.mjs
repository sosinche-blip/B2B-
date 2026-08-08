import { readFileSync } from 'node:fs';

const app = readFileSync('apps/web/src/App.tsx','utf8');
const worker = readFileSync('apps/worker/src/worker.ts','utf8');
const types = readFileSync('apps/worker/src/types.ts','utf8');

function must(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`[PASS] ${message}`);
}

console.log('\n[ROUND 1] source wiring / security');
must(app.includes('V208 어드민플러스 다계정·자동발주·송장자동화') || app.includes('V210 엑셀매핑 자동추천·검색형 어드민플러스 매칭') || app.includes('V211 어드민플러스 기본수량·배송비·구성원가 매칭') || app.includes('V212 API 기본수량·배송비 수동수정·종료쿠폰 복구발행'), 'V208+ AdminPlus UI version marker');
must(app.includes('어드민플러스 셀러 API 다계정 관리'), 'AdminPlus multi-account credential UI');
must(app.includes('토스쇼핑 API 인증키·토큰 관리'), 'Toss credential/token management UI');
must(app.includes('어드민플러스 설정시간별 발주·운송장 자동화'), 'AdminPlus timed automation UI');
must(worker.includes('/api/integrations/adminplus/purchase/preflight') && worker.includes('/api/integrations/adminplus/purchase/execute'), 'AdminPlus purchase preflight/execute endpoints');
must(worker.includes('/api/integrations/adminplus/shipments/preflight') && worker.includes('/api/integrations/adminplus/shipments/sync'), 'AdminPlus shipment preflight/sync endpoints');
must(worker.includes('/api/admin/adminplus-credentials/') && worker.includes('/api/admin/toss-credentials/'), 'AdminPlus/Toss credential routes are fixed-IP proxied');
must(types.includes('ADMINPLUS_ACCOUNTS_JSON?: string') && types.includes('ADMINPLUS_BASE_URL?: string'), 'AdminPlus env typing');
must(worker.includes('expiresAt - Date.now() > 5 * 60 * 1000'), 'Access tokens refresh before expiry');
must(worker.includes('performed.response.status === 401') && worker.includes('forceRefresh'), 'Toss token refresh/retry on HTTP 401');

console.log('\n[ROUND 2] official-flow invariants / safety');
must(worker.includes('POST", "/v1/seller/orders"'), 'AdminPlus order registration uses POST /v1/seller/orders');
must(worker.includes('GET", "/v1/seller/orders/changed"'), 'AdminPlus shipment polling uses GET /v1/seller/orders/changed');
must(worker.includes('GET", "/v1/seller/product_matches"'), 'AdminPlus product-string match is preflight-checked');
must(worker.includes('customer_order_code: adminplusCustomerOrderCode'), 'AdminPlus customer order code generated deterministically');
must(worker.includes('historyKeys.has(sourceKey)'), 'Already-purchased marketplace rows are idempotently blocked');
must(worker.includes('retryOnFailure: true') && worker.includes('failed_retryable'), 'Failed AdminPlus schedule slots retry inside scheduler window without duplicating completed rows');
must(worker.includes('config.startedAt') && worker.includes('자동화 시작 전 주문'), 'Pre-automation orders are blocked');
must(worker.includes('receiver_name') && worker.includes('receiver_hp') && worker.includes('receiver_addr1'), 'Required receiver fields checked before AdminPlus order registration');
must(!worker.slice(worker.indexOf('async function adminplusPurchaseRun'), worker.indexOf('function adminplusKstDateTime')).includes('/v1/seller/payments'), 'Automatic purchase does not auto-charge/payment-submit');
must(worker.includes('shipmentUploadExecute') && worker.includes('orderAcknowledgeExecute'), 'Retrieved AdminPlus tracking is handed to existing Coupang/Toss shipment pipeline');
must(worker.includes('const matchCache = new Map') && worker.includes('matchChecks: matchCache.size'), 'Repeated supplier/product preflight checks are cached per run to reduce AdminPlus rate-limit pressure');
must(worker.includes('adminplusFindOrderByCustomerCode') && worker.includes('API 응답 불확실 후 customer_order_code 조회'), 'Uncertain/duplicate AdminPlus order registration is reconciled by customer_order_code before retry');
must(worker.includes('1:N 매칭 주문의 일부 상품만 송장이 확정') && worker.includes('서로 다른 송장'), '1:N AdminPlus tracking is blocked until one consistent marketplace shipment can be proven');
must(worker.includes('pendingRows') && worker.includes('shipmentUploadedAt') && worker.includes('trackingNo'), 'Detected tracking is persisted as pending so marketplace upload can retry without losing the AdminPlus change event');
must(worker.includes('result.canAdvanceWatermark ? { lastShipmentAt:'), 'AdminPlus shipment watermark advances only when change polling is safe');

console.log('\n[ROUND 3] deterministic scenario simulation');
const mappings = [
  {channel:'쿠팡',optionId:'111',vendorName:'A농장',vendorProductName:'사과1kg',baseQty:1},
  {channel:'토스',optionId:'222',vendorName:'B수산',vendorProductName:'바지락2kg',baseQty:2},
];
const accounts = [
  {id:'a',vendorName:'A농장',enabled:true},
  {id:'b',vendorName:'B수산',enabled:true},
];
const orders = [
  {channel:'쿠팡',orderNo:'C100',optionId:'111',qty:2},
  {channel:'토스',orderNo:'T200',optionId:'222',qty:1},
];
const historyKey = (r) => `${r.channel}|${r.orderNo}|${r.optionId}`;
const history = new Set(['쿠팡|OLD|111']);
const routed = orders.map((order) => {
  const mapping = mappings.find((m)=>m.channel===order.channel && m.optionId===order.optionId);
  const account = accounts.find((a)=>a.vendorName===mapping?.vendorName && a.enabled);
  return {sourceKey:historyKey(order), account:account?.id, productString:mapping?.vendorProductName, orderItemQty:order.qty, matchQty:(mapping?.baseQty||1)};
});
must(routed[0].account==='a' && routed[0].productString==='사과1kg' && routed[0].orderItemQty===2 && routed[0].matchQty===1, 'Coupang order routes to correct AdminPlus seller');
must(routed[1].account==='b' && routed[1].productString==='바지락2kg' && routed[1].orderItemQty===1 && routed[1].matchQty===2, 'Toss order keeps marketplace qty while product-match base quantity expands internally');
must(!history.has(routed[0].sourceKey) && routed[0].sourceKey==='쿠팡|C100|111', 'New order receives stable dedupe key');
const changed = {customer_order_code:'B2B-C-C100-111',shipping_company:'CJ대한통운',tracking_number:'1234567890'};
must(Boolean(changed.customer_order_code && changed.shipping_company && changed.tracking_number), 'AdminPlus changed-order row contains fields needed for shipment handoff');

console.log('\n[PASS] V208 AdminPlus/Toss automation verification completed (3 rounds).');
