#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envPath = path.join(root, '.dev.vars');
const examplePath = path.join(root, '.dev.vars.example');
const workerEnvPath = path.join(root, 'apps', 'worker', '.dev.vars');

const COUPANG_DAILY_ORDER_PATH = '/v2/providers/openapi/apis/api/v5/vendors/{vendorId}/ordersheets';
const COUPANG_VENDOR_ITEM_INVENTORY_PATH = '/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/{vendorItemId}/inventories';
const COUPANG_COUPON_CREATE_PATH = '/v2/providers/fms/apis/api/v2/vendors/{vendorId}/coupon';
const COUPANG_COUPON_ITEM_CREATE_PATH = '/v2/providers/fms/apis/api/v1/vendors/{vendorId}/coupons/{couponId}/items';
const COUPANG_COUPON_EXPIRE_PATH = '/v2/providers/fms/apis/api/v1/vendors/{vendorId}/coupons/{couponId}';
const COUPANG_COUPON_REQUEST_STATUS_PATH = '/v2/providers/fms/apis/api/v1/vendors/{vendorId}/requested/{requestedId}';

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function setEnvValue(text, key, value) {
  const line = `${key}="${value}"`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) return text.replace(re, line);
  const needsNewline = text && !text.endsWith('\n');
  return `${text}${needsNewline ? '\n' : ''}${line}\n`;
}

function hasUsableEnv(text) {
  return /SUPABASE_URL\s*=/.test(text) || /COUPANG_VENDOR_ID\s*=/.test(text) || /TOSS_CLIENT_ID\s*=/.test(text);
}

function restoreCoupangDailyOrderPath(text) {
  if (/COUPANG_FORCE_ORDER_PATH_AS_IS\s*=\s*["']?true["']?/i.test(text)) return text;
  const dailyPath = COUPANG_DAILY_ORDER_PATH;
  return text.replace(
    /COUPANG_ORDERS_PATH=.*/,
    `COUPANG_ORDERS_PATH="${dailyPath}"`
  ).replace(
    '/v2/providers/openapi/apis/api/v5/vendors/{vendorId}/ordersheets',
    dailyPath
  );
}

function removeRetiredKeys(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*(ALLOW_AUTO_PURCHASE|B2B_PURCHASE_PREVIEW_TIMES|B2B_PURCHASE_PREVIEW_LIMIT|COUPON_PREVIEW_LIMIT|COUPANG_PRODUCTS_PATH|COUPANG_COUPON_ID|COUPANG_COUPON_CONTRACT_ID)\s*=/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd() + '\n';
}

function normalize(text, liveMode) {
  let out = removeRetiredKeys(restoreCoupangDailyOrderPath(text));
  if (!/COUPANG_ORDERS_PATH\s*=/.test(out)) {
    out = setEnvValue(out, 'COUPANG_ORDERS_PATH', COUPANG_DAILY_ORDER_PATH);
  }
  if (!/COUPANG_ORDER_MAX_RETRIES\s*=/.test(out)) out = setEnvValue(out, 'COUPANG_ORDER_MAX_RETRIES', '4');
  if (!/COUPANG_ORDER_RETRY_BASE_MS\s*=/.test(out)) out = setEnvValue(out, 'COUPANG_ORDER_RETRY_BASE_MS', '850');
  if (!/COUPANG_ORDER_DAY_SPLIT_DELAY_MS\s*=/.test(out)) out = setEnvValue(out, 'COUPANG_ORDER_DAY_SPLIT_DELAY_MS', '250');
  if (!/COUPANG_ORDER_MAX_PAGES\s*=/.test(out)) out = setEnvValue(out, 'COUPANG_ORDER_MAX_PAGES', '10');
  out = setEnvValue(out, 'COUPANG_VENDOR_ITEM_INVENTORY_PATH', COUPANG_VENDOR_ITEM_INVENTORY_PATH);
  out = setEnvValue(out, 'COUPANG_COUPON_CREATE_PATH', COUPANG_COUPON_CREATE_PATH);
  out = setEnvValue(out, 'COUPANG_COUPON_APPLY_PATH', COUPANG_COUPON_ITEM_CREATE_PATH);
  out = setEnvValue(out, 'COUPANG_COUPON_CANCEL_PATH', COUPANG_COUPON_EXPIRE_PATH);
  out = setEnvValue(out, 'COUPANG_COUPON_REQUEST_STATUS_PATH', COUPANG_COUPON_REQUEST_STATUS_PATH);
  if (!/COUPANG_COUPON_MAX_DISCOUNT_PRICE\s*=/.test(out)) out = setEnvValue(out, 'COUPANG_COUPON_MAX_DISCOUNT_PRICE', '100000');
  if (!/COUPANG_COUPON_WOW_EXCLUSIVE\s*=/.test(out)) out = setEnvValue(out, 'COUPANG_COUPON_WOW_EXCLUSIVE', 'false');
  out = setEnvValue(out, 'API_CONNECTION_PAUSED', liveMode ? 'false' : 'true');
  out = setEnvValue(out, 'ALLOW_LIVE_EXTERNAL_API', liveMode ? 'true' : 'false');
  out = setEnvValue(out, 'ALLOW_FINAL_EXECUTION', liveMode ? 'true' : 'false');
  return out;
}

const safeMode = ['1', 'true', 'yes', 'on'].includes(String(process.env.B2B_SAFE_MODE || '').toLowerCase());
const liveMode = !safeMode;
let text = readText(envPath);
if (!text) {
  const example = readText(examplePath);
  if (!example) {
    console.error('[V172] .dev.vars and .dev.vars.example were not found.');
    process.exit(1);
  }
  text = example;
  fs.writeFileSync(envPath, text, 'utf8');
  console.log('[V172] .dev.vars was missing, so .dev.vars.example was copied. Enter real secret values before collection.');
}

const before = text;
const normalized = normalize(text, liveMode);
if (before !== normalized && hasUsableEnv(before)) {
  const backup = `${envPath}.backup_${nowStamp()}`;
  fs.writeFileSync(backup, before, 'utf8');
  console.log(`[V172] Backed up existing .dev.vars before normalization: ${path.basename(backup)}`);
}
text = normalized;
fs.writeFileSync(envPath, text, 'utf8');

if (fs.existsSync(workerEnvPath)) {
  const workerBefore = readText(workerEnvPath);
  const workerAfter = normalize(workerBefore, liveMode);
  if (workerBefore !== workerAfter) {
    fs.writeFileSync(workerEnvPath, workerAfter, 'utf8');
    console.log('[V172] apps/worker/.dev.vars was normalized with the same API gates.');
  }
}

if (before === text) {
  console.log('[V172] .dev.vars collection settings are already aligned.');
} else {
  console.log('[V172] .dev.vars was normalized: order collection gate and Coupang daily path aligned.');
}
console.log(`[V172] API mode: ${liveMode ? 'LIVE order collection enabled' : 'SAFE live marketplace calls blocked'}`);
console.log('[V172] Order collection is manual button only, and compact mobile UI is enabled.');
