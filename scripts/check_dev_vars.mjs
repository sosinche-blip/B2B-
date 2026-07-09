#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const strict = String(process.env.B2B_STRICT_ENV_CHECK || '').toLowerCase() === 'true';
const candidates = [
  path.join(root, '.dev.vars'),
  path.join(root, 'apps', 'worker', '.dev.vars'),
];

const required = [
  { key: 'SUPABASE_URL', group: 'Supabase' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', group: 'Supabase' },
  { key: 'COUPANG_VENDOR_ID', group: 'Coupang' },
  { key: 'COUPANG_ACCESS_KEY', group: 'Coupang' },
  { key: 'COUPANG_SECRET_KEY', group: 'Coupang' },
  { key: 'COUPANG_ORDERS_PATH', group: 'Coupang' },
  { key: 'TOSS_CLIENT_ID', group: 'Toss' },
  { key: 'TOSS_CLIENT_SECRET', group: 'Toss' },
  { key: 'TOSS_ORDERS_PATH', group: 'Toss' },
];

const recommended = [
  { key: 'API_CONNECTION_PAUSED', group: 'Gate', expected: 'false', reason: 'START_HERE 주문수집 API 허용' },
  { key: 'ALLOW_LIVE_EXTERNAL_API', group: 'Gate', expected: 'true', reason: 'START_HERE 주문수집 API 허용' },
  { key: 'ALLOW_FINAL_EXECUTION', group: 'Gate', expected: 'true', reason: '수동 주문수집/송장 업로드 허용' },
  { key: 'ALLOW_SCHEDULED_WRITES', group: 'Safety', expected: 'true', reason: '운영 스케줄러 사용 기본값' },
];

const optional = [
  'COUPANG_SHIPMENT_UPLOAD_PATH',
  'COUPANG_VENDOR_ITEM_INVENTORY_PATH',
  'COUPANG_COUPON_CREATE_PATH',
  'COUPANG_COUPON_APPLY_PATH',
  'COUPANG_COUPON_CANCEL_PATH',
  'COUPANG_COUPON_REQUEST_STATUS_PATH',
  'COUPANG_COUPON_MAX_DISCOUNT_PRICE',
  'COUPANG_COUPON_WOW_EXCLUSIVE',
  'TOSS_TOKEN_URL',
  'TOSS_SCOPE',
  'TOSS_SHOPPING_BASE_URL',
  'TOSS_SHIPMENT_UPLOAD_PATH',
  'SELLER_NAME',
  'SELLER_PHONE',
  'SELLER_ZIP_CODE',
  'SELLER_ADDRESS',
  'SELLER_BUSINESS_NO',
];

function parseEnv(text) {
  const vars = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

function isPlaceholder(value) {
  return !value || /여기에|xxxxx|example|your_|changeme|secret key|판매자 연락처|판매자 주소|사업자등록번호/i.test(value);
}

function maskStatus(value) {
  if (isPlaceholder(value)) return 'MISSING_OR_PLACEHOLDER';
  return `SET(length=${String(value).length})`;
}

const existing = candidates.filter((file) => fs.existsSync(file));
if (!existing.length) {
  console.error('[환경변수 확인] .dev.vars 파일을 찾지 못했습니다.');
  console.error('V172에서는 서버 시작을 막지 않습니다. 실제 수집 전에는 .dev.vars.example을 복사해 실제 값을 채워 주세요.');
  if (strict) process.exit(1);
  process.exit(0);
}

if (existing.length > 1) {
  console.warn('[주의] .dev.vars가 2곳에 있습니다. Wrangler 실행 위치에 따라 다른 값이 사용될 수 있습니다.');
  for (const file of existing) console.warn(`- ${path.relative(root, file)}`);
}

const envFile = existing[0];
const vars = parseEnv(fs.readFileSync(envFile, 'utf8'));
console.log(`[환경변수 확인] ${path.relative(root, envFile)} 사용`);
console.log('실제 값은 보안상 출력하지 않습니다. V172에서는 Gate 경고가 있어도 서버 시작을 막지 않습니다\n');

const rows = [];
let requiredProblems = 0;
for (const item of required) {
  const value = vars[item.key];
  const ok = !isPlaceholder(value);
  if (!ok) requiredProblems += 1;
  rows.push({
    group: item.group,
    key: item.key,
    status: ok ? 'OK' : 'CHECK',
    detail: maskStatus(value),
  });
}

let warnings = 0;
for (const item of recommended) {
  const value = vars[item.key];
  const missing = isPlaceholder(value);
  const mismatch = !missing && String(value).toLowerCase() !== item.expected;
  if (missing || mismatch) warnings += 1;
  rows.push({
    group: item.group,
    key: item.key,
    status: missing || mismatch ? 'WARN' : 'OK',
    detail: missing ? `recommended ${item.expected}` : (mismatch ? `recommended ${item.expected}` : maskStatus(value)),
  });
}

const optionalRows = optional.map((key) => ({
  group: 'Optional',
  key,
  status: isPlaceholder(vars[key]) ? 'EMPTY' : 'SET',
  detail: maskStatus(vars[key]),
}));

console.table(rows);
console.table(optionalRows);

if (String(vars.API_CONNECTION_PAUSED ?? 'false').toLowerCase() !== 'false') {
  console.error('\n[주의] START_HERE 실행 시 API_CONNECTION_PAUSED=false가 정상입니다. API를 차단하려면 START_SAFE_MODE_WINDOWS.cmd를 사용하세요.');
}

if (requiredProblems > 0) {
  console.error(`\n필수 환경변수 확인필요 ${requiredProblems}건이 있습니다. 다만 V172에서는 서버 시작 검증을 위해 차단하지 않습니다.`);
  if (strict) process.exit(1);
}
if (warnings > 0) {
  console.error(`\n권장 Gate/Safety 값 확인필요 ${warnings}건이 있습니다. V172에서는 경고만 표시하고 서버 시작은 계속합니다.`);
}

console.log('\n환경변수 점검 완료: 실제 키 값은 출력하지 않았고, 서버 시작은 계속 진행할 수 있습니다.');
