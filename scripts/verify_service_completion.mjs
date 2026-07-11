import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const requiredFiles = [
  "package.json",
  "README.md",
  "OPERATIONS_GUIDE_V188.md",
  "V188_RELEASE_NOTES.md",
  "V188_REVIEW_REPORT.md",
  "DEPLOY_CLOUDFLARE_V188.md",
  "apps/web/src/App.tsx",
  "apps/web/src/style.css",
  "apps/worker/src/worker.ts",
  "apps/worker/src/types.ts",
  "supabase/schema.sql",
  "supabase/migrations/20260710_v187_coupon_automation.sql",
  "scripts/start_ncloud_api.mjs",
  "scripts/ncloud_node_server.ts",
];

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}
function pass(message) { console.log(`[PASS] ${message}`); }
function read(file) { return readFileSync(join(root, file), "utf8"); }
function mustInclude(name, text, snippets) {
  for (const snippet of snippets) if (!text.includes(snippet)) fail(`${name} missing required snippet: ${snippet}`);
}
function mustNotInclude(name, text, snippets) {
  for (const snippet of snippets) if (text.includes(snippet)) fail(`${name} still contains removed snippet: ${snippet}`);
}

console.log("[VERIFY] V188 API overview and selectable paid-order audit");
for (const file of requiredFiles) if (!existsSync(join(root, file))) fail(`Required file missing: ${file}`);
if (!process.exitCode) pass("Required V188 project and deployment files exist");

const staleDocs = readdirSync(root).filter((name) => /^(OPERATIONS_GUIDE|DEPLOY_CLOUDFLARE|V\d+_(RELEASE_NOTES|REVIEW_REPORT))_V18[0-7]/.test(name));
if (staleDocs.length) fail(`Old release documents remain: ${staleDocs.join(", ")}`);
else pass("Old V180-V187 deployment documents are cleaned");

const pkg = JSON.parse(read("package.json"));
const webPkg = JSON.parse(read("apps/web/package.json"));
const workerPkg = JSON.parse(read("apps/worker/package.json"));
if (!String(pkg.version || "").includes("v188")) fail("root package version is not v188");
if (!String(webPkg.version || "").includes("v188")) fail("web package version is not v188");
if (!String(workerPkg.version || "").includes("v188")) fail("worker package version is not v188");
if (!process.exitCode) pass("V188 package versions exist");

const app = read("apps/web/src/App.tsx");
mustInclude("App", app, [
  'APP_VERSION = "V188 API 현황·선택주문·모바일 바로가기 운영본"',
  "refreshApiOverview",
  "previewSelectablePaymentOrders",
  "collectSelectedPaymentOrders",
  "renderOrderSelectionPanel",
  "쿠팡 주문조회",
  "토스 주문조회",
  "선택 주문 수집",
  "로그인ID를 복사했습니다",
  "Supabase에 자동 저장했습니다",
  "runCouponAutomationPreflight",
  "activateCouponAutomation",
  "stopCouponAutomation",
]);
mustNotInclude("Coupon UI", app, [
  '<button type="button" className="btn-save" onClick={saveSettingsToBrowser}>브라우저 저장</button>\n              <button type="button" className="btn-save" onClick={saveSettingsToServer}>서버 저장</button>',
]);
if (!process.exitCode) pass("API overview, selectable orders, mobile shortcuts and coupon autosave are connected");

const css = read("apps/web/src/style.css");
mustInclude("Style", css, [
  ".channel-operation-metrics { grid-template-columns: repeat(4",
  ".order-selection-panel",
  ".order-selection-item",
]);
if (!process.exitCode) pass("Mobile four-column overview and order selection styles exist");

const worker = read("apps/worker/src/worker.ts");
mustInclude("Worker", worker, [
  'SERVER_OPERATION_SQL_FILE =\n  "supabase/migrations/20260710_v187_coupon_automation.sql"',
  "pollCoupangCouponRequestStatus",
  "coupon_automation_retries",
  "coupon_automation_failures",
  "cloudflare_worker_to_ncloud_fixed_ip_gateway_v187",
  "toss_coupon_automation_unavailable_v187",
]);
if (!process.exitCode) pass("V187 coupon automation backend remains connected for V188 frontend");

const ncloudServer = read("scripts/ncloud_node_server.ts");
mustInclude("Ncloud gateway", ncloudServer, [
  "V187 fixed-IP gateway",
  "No UI or B2B file storage is enabled.",
]);
mustNotInclude("Ncloud gateway", ncloudServer, ["listManagedFiles", "save-many", "read-file"]);
if (!process.exitCode) pass("Ncloud remains the minimal fixed-IP gateway");

const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";
function run(label, args) {
  console.log(`\n[VERIFY] ${label}`);
  const result = spawnSync(args[0], args.slice(1), { stdio: "inherit", shell: isWin });
  if (result.status !== 0) {
    console.error(`[FAIL] ${label}`);
    process.exit(result.status || 1);
  }
  console.log(`[PASS] ${label}`);
}
run("Web production build", [npmCmd, "--workspace", "apps/web", "run", "build"]);
run("Worker TypeScript check", ["npx", "tsc", "-p", "apps/worker/tsconfig.json", "--noEmit"]);
run("Ncloud build-only check", [npmCmd, "run", "build:ncloud"]);
if (process.exitCode) process.exit(process.exitCode);
console.log("\n[PASS] V188 service verification completed.");
