import { readFileSync } from "node:fs";

const app = readFileSync("apps/web/src/App.tsx", "utf8");
const css = readFileSync("apps/web/src/style.css", "utf8");

const requiredApp = [
  'APP_VERSION = "V194 운영관제·재처리·주소품질 운영본"',
  "function renderOperationControlPanel()",
  "일일 운영 점검판",
  "마감보고서 다운로드",
  "실패 재처리 센터",
  "실패단계 재시도",
  "function analyzeOrderAddress(order: OrderRow)",
  "상세주소 누락",
  "괄호 뒤 상세주소 확인",
  "function retryOperationalFailure(row: OperationalFailureRow)",
  "operationalFailures?: OperationalFailureRow[]",
  'recordOperationalFailure("order_lookup"',
  'recordOperationalFailure("order_collect"',
  'recordOperationalFailure("shipment_preview"',
  'recordOperationalFailure("shipment_upload"',
  'recordOperationalFailure("purchase_export"',
  "exportDailyOperationReport",
  "exportAddressQualityReport",
];

const requiredCss = [
  ".operation-control-panel",
  ".operation-control-metrics",
  ".operation-control-table",
  ".metric-danger",
  ".row-warning",
];

const forbidden = [
  "V193 주소 무결성 복구 운영본",
  "즉시 24시간 쿠폰 생성",
  "즉시 직전쿠폰 취소",
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
for (const snippet of forbidden) {
  if (app.includes(snippet)) {
    console.error(`[FAIL] obsolete UI remains: ${snippet}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("[PASS] V194 operation control features are present");
console.log("[PASS] daily dashboard, retry center, and address quality checks are wired");
