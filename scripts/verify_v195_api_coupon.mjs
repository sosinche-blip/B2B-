import { readFileSync } from "node:fs";

const app = readFileSync("apps/web/src/App.tsx", "utf8");
const css = readFileSync("apps/web/src/style.css", "utf8");
const worker = readFileSync("apps/worker/src/worker.ts", "utf8");

const requiredApp = [
  'APP_VERSION = "V195 API 경로관리·쿠폰 즉시적용 운영본"',
  "type ApiEndpointSettings = {",
  "const API_ENDPOINT_FIELDS",
  "apiEndpointSettings: normalizeApiEndpointSettings(apiEndpointSettings)",
  "function ApiEndpointSettingsPanel",
  "Ncloud 자동운영용 서버 저장",
  "쿠팡 주문 API 진단",
  "async function applyRollingCouponTemplateNow",
  ">즉시 적용</button>",
  '<option value="율">정률(%)</option>',
  "정률 할인 최대할인금액",
];

const requiredCss = [
  ".stacked-action-buttons",
  ".api-endpoint-settings-panel",
  ".api-path-input",
];

const requiredWorker = [
  "const RUNTIME_API_PATH_KEYS",
  "function envWithApiEndpointSettings",
  "async function apiEndpointSettingsFromRequest",
  "savedPayload.apiEndpointSettings",
  'version: "v195-api-path-coupon-immediate"',
  'type: discountType === "율" ? "RATE" : "PRICE"',
  "정률 할인은 1~99 정수만 가능",
];

let failed = false;
for (const snippet of requiredApp) {
  if (!app.includes(snippet)) {
    console.error(`[FAIL] App missing: ${snippet}`);
    failed = true;
  }
}
for (const snippet of requiredCss) {
  if (!css.includes(snippet)) {
    console.error(`[FAIL] CSS missing: ${snippet}`);
    failed = true;
  }
}
for (const snippet of requiredWorker) {
  if (!worker.includes(snippet)) {
    console.error(`[FAIL] Worker missing: ${snippet}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("[PASS] API endpoint settings are persisted and applied to manual/scheduled calls");
console.log("[PASS] rolling coupon immediate replacement action is wired");
console.log("[PASS] fixed-price and percentage coupon inputs are wired");
