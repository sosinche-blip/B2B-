#!/usr/bin/env node
const secretKeys = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'COUPANG_VENDOR_ID',
  'COUPANG_ACCESS_KEY',
  'COUPANG_SECRET_KEY',
  'COUPANG_ORDERS_PATH',
  'COUPANG_SHIPMENT_UPLOAD_PATH',
  'COUPANG_VENDOR_ITEM_INVENTORY_PATH',
  'COUPANG_COUPON_APPLY_PATH',
  'COUPANG_COUPON_CANCEL_PATH',
  'TOSS_CLIENT_ID',
  'TOSS_CLIENT_SECRET',
  'TOSS_ORDERS_PATH',
  'TOSS_SHIPMENT_UPLOAD_PATH',
  'TOSS_SHOPPING_BASE_URL',
  'TOSS_TOKEN_URL',
  'TOSS_SCOPE',
  'API_CONNECTION_PAUSED',
  'ALLOW_LIVE_EXTERNAL_API',
  'ALLOW_FINAL_EXECUTION',
  'ALLOW_SCHEDULED_WRITES',
  'SELLER_NAME',
  'SELLER_PHONE',
  'SELLER_ZIP_CODE',
  'SELLER_ADDRESS',
  'SELLER_BUSINESS_NO',
];

console.log('Cloudflare Secret 등록 명령어입니다. 실제 값은 각 명령 실행 후 터미널에 붙여넣으세요.');
console.log('스케줄 쓰기 안전 기준: ALLOW_SCHEDULED_WRITES=false\n');
for (const key of secretKeys) {
  console.log(`npx wrangler secret put ${key} --config wrangler.toml`);
}
