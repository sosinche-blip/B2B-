import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const requiredFiles = [
  "package.json",
  "README.md",
  "OPERATIONS_GUIDE_V194.md",
  "V194_RELEASE_NOTES.md",
  "V194_REVIEW_REPORT.md",
  "DEPLOY_CLOUDFLARE_V194.md",
  "apps/web/src/App.tsx",
  "apps/web/src/style.css",
  "apps/web/src/utils/address.ts",
  "apps/worker/src/worker.ts",
  "apps/worker/src/types.ts",
  "apps/worker/src/address.ts",
  "scripts/verify_address_integrity.mjs",
  "scripts/verify_preparing_order_collection.mjs",
  "supabase/schema.sql",
  "supabase/migrations/20260710_v187_coupon_automation.sql",
];
const forbiddenCloudFiles = [
  "REPAIR_NCLOUD_SERVER.sh",
  "REPAIR_NCLOUD_GATEWAY.sh",
  "DIAGNOSE_SERVER_WINDOWS.cmd",
  "INSTALL_FIX_WINDOWS.cmd",
  "START_HERE_WINDOWS.cmd",
  "START_SAFE_MODE_WINDOWS.cmd",
  "scripts/ncloud_node_server.ts",
  "scripts/start_ncloud_api.mjs",
  "scripts/install_ncloud_systemd.sh",
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

console.log("[VERIFY] V194 payment/preparing order selection and address integrity audit");
for (const file of requiredFiles) if (!existsSync(join(root, file))) fail(`Required file missing: ${file}`);
if (!process.exitCode) pass("Required V194 project, regression and deployment files exist");

const staleDocs = readdirSync(root).filter((name) => /^(OPERATIONS_GUIDE|DEPLOY_CLOUDFLARE)_V(18[0-9]|19[0-3])|^V(18[0-9]|19[0-3])_(RELEASE_NOTES|REVIEW_REPORT)/.test(name));
if (staleDocs.length) fail(`Old V180-V193 release documents remain: ${staleDocs.join(", ")}`);
else pass("Old V180-V193 deployment documents are cleaned");

for (const file of forbiddenCloudFiles) if (existsSync(join(root, file))) fail(`Cloud package still contains obsolete server/local file: ${file}`);
if (!process.exitCode) pass("Cloud package remains separated from the Ncloud gateway");

const pkg = JSON.parse(read("package.json"));
const webPkg = JSON.parse(read("apps/web/package.json"));
const workerPkg = JSON.parse(read("apps/worker/package.json"));
if (!String(pkg.version || "").includes("v194")) fail("root package version is not v194");
if (!String(webPkg.version || "").includes("v194")) fail("web package version is not v194");
if (!String(workerPkg.version || "").includes("v194")) fail("worker package version is not v194");
if (!process.exitCode) pass("V194 package versions exist");

const app = read("apps/web/src/App.tsx");
mustInclude("App", app, [
  'APP_VERSION = "V194 결제·상품준비중 선택수합 운영본"',
  "function addressCell",
  "ADDRESS_BASE_ALIASES",
  "ADDRESS_DETAIL_ALIASES",
  "address: addressCell(row, map)",
  "function mergeLatestOrderRows",
  "orderSelectionModeFromStatus",
  "상품준비중 주문을 업체송장 매칭·송장업로드 대상에 반영했습니다.",
  "createImmediateNewCouponTemplates",
]);
mustNotInclude("App", app, [
  "previewSelectablePaymentOrders",
  "collectSelectedPaymentOrders",
  "한 번에 등록할 옵션은 상품명 입력값을 동일하게 맞추세요.",
  "한 번에 등록할 옵션은 할인구분과 할인값을 동일하게 맞추세요.",
  "START_HERE_WINDOWS.cmd",
  "8791",
]);
if (!process.exitCode) pass("Web supports payment/preparing selection and preserves full addresses");

const worker = read("apps/worker/src/worker.ts");
mustInclude("Worker", worker, [
  'version: "v194-preparing-order-selection"',
  '"detailAddress"',
  '"parent.receiver.addr2"',
  "return joinAddressParts(baseAddress, directAddress, detailAddress);",
  "runCoupangCouponApply",
]);
if (!process.exitCode) pass("Worker retains V193 full-address normalization with V194 versioning");

const workerAddress = read("apps/worker/src/address.ts");
const webAddress = read("apps/web/src/utils/address.ts");
if (workerAddress !== webAddress) fail("Worker and Web address joining logic diverged");
else pass("Worker and Web use identical address joining rules");

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
run("Preparing-order selection regression", ["node", "scripts/verify_preparing_order_collection.mjs"]);
run("Address integrity regression", ["node", "scripts/verify_address_integrity.mjs"]);
run("Web production build", [npmCmd, "--workspace", "apps/web", "run", "build"]);
run("Worker TypeScript check", ["npx", "tsc", "-p", "apps/worker/tsconfig.json", "--noEmit"]);
if (process.exitCode) process.exit(process.exitCode);
console.log("\n[PASS] V194 service verification completed.");
