import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const requiredFiles = [
  "package.json",
  "README.md",
  "DEPLOYMENT_GUIDE_V181.md",
  "MOBILE_OPERATION_CHECKLIST_V181.md",
  "V181_RELEASE_NOTES.md",
  "V181_DEVELOPMENT_SUMMARY.md",
  "GITHUB_UPLOAD_GUIDE_V181.md",
  "scripts/start_local_preview.mjs",
  "scripts/local_folder_helper.mjs",
  "scripts/check_dev_vars.mjs",
  "scripts/verify_local_project.mjs",
  "scripts/verify_git_safe.mjs",
  "apps/web/src/App.tsx",
  "apps/web/src/utils/spreadsheet.ts",
  "apps/web/src/style.css",
  "apps/worker/src/worker.ts",
  "apps/worker/src/types.ts",
  "supabase/schema.sql"
];
function fail(message) { console.error(`[FAIL] ${message}`); process.exitCode = 1; }
function pass(message) { console.log(`[PASS] ${message}`); }
function read(file) { return readFileSync(join(root, file), "utf8"); }
function mustInclude(name, text, snippets) { for (const snippet of snippets) if (!text.includes(snippet)) fail(`${name} missing required snippet: ${snippet}`); }
function mustNotInclude(name, text, snippets) { for (const snippet of snippets) if (text.includes(snippet)) fail(`${name} still contains removed snippet: ${snippet}`); }

console.log("[VERIFY] V181 pages npm registry lock fix audit");
for (const file of requiredFiles) if (!existsSync(join(root, file))) fail(`Required file missing: ${file}`);
if (!process.exitCode) pass("Required project and current deployment files exist");

const legacyRootDocs = readdirSync(root).filter((name) => /^(DEPLOYMENT_GUIDE|MOBILE_OPERATION_CHECKLIST|GITHUB_UPLOAD_GUIDE)_V(16[9]|17[0-8])\.md$|^V(16[9]|17[0-8])_(RELEASE_NOTES|DEVELOPMENT_SUMMARY)\.md$/.test(name));
if (legacyRootDocs.length) fail(`Legacy root documents remain: ${legacyRootDocs.join(", ")}`);
else pass("Legacy root documents are removed from deploy package");

const pkg = JSON.parse(read("package.json"));
for (const script of ["dev:all", "build", "typecheck:worker", "verify:local", "verify:service", "check:env", "verify:git-safe"]) if (!pkg.scripts?.[script]) fail(`package.json script missing: ${script}`);
if (!String(pkg.version || "").includes("v181")) fail("package version is not v181");
const webPkg = JSON.parse(read("apps/web/package.json"));
if (!String(webPkg.version || "").includes("v181")) fail("web package version is not v181");
const workerPkg = JSON.parse(read("apps/worker/package.json"));
if (!String(workerPkg.version || "").includes("v181")) fail("worker package version is not v181");
if (!process.exitCode) pass("V181 package versions exist");

const app = read("apps/web/src/App.tsx");
mustInclude("App", app, [
  'APP_VERSION = "V181_PAGES_NPM_REGISTRY_LOCK_FIX"',
  '"간편운영"', '"주문관리"', '"매핑관리"', '"양식설정"', '"발주관리"', '"쿠폰관리"', '"스케줄러"', '"운영설정"',
  'handleVendorShipmentFilesToPurchase',
  'runShipmentUploadAll',
  'V181 모바일 단계 잠금판',
  'V181 송장 업로드 안전검증',
  '환경변수 점검',
  'V181 실행경로 점검',
  'checkRuntimePath',
  'checkDeployReadiness',
  'safeProfitSettings',
  'B2B_매핑양식_V181.xls',
  '채널", "옵션ID", "업체명", "코드번호", "업체상품명", "원가", "기본수량'
]);
mustNotInclude("App", app, [
  'checkApiGateway', 'API 502 점검', 'apiGatewayRows',
  'NCLOUD_DIRECT_API_BASE', 'NCLOUD_DIRECT_FALLBACK_ENABLED',
  'activeMenu === "순이익"', 'setActiveMenu("순이익")', '"순이익",',
  'runProfitSettlementPreview', 'runProfitSchedulerSnapshot', 'collectProfitSalesOrders',
  'syncCoupangOptionMastersFromApi', 'coupangOptionRowsFromApiResult'
]);
if (!process.exitCode) pass("Web app cleanup checks passed");

const spreadsheetUtil = read("apps/web/src/utils/spreadsheet.ts");
mustInclude("spreadsheet util", spreadsheetUtil, ["import * as XLSX from \"xlsx\"", "xlsx.read"]);
if (!process.exitCode) pass("Spreadsheet upload parser remains bundled and stable");

const worker = read("apps/worker/src/worker.ts");
mustInclude("Worker", worker, [
  'APP_VERSION = "V181_PAGES_NPM_REGISTRY_LOCK_FIX"',
  "runtime_path_clarity_v181", "github_pages_deploy_assist_v181", "shipmentUploadExecute", "scheduler_tick_v147",
  "실제 .dev.vars 로드"
]);
mustNotInclude("Worker", worker, [
  "/api/system/api-gateway-check", "apiGatewayCheck", "ncloud_proxy_guard_v178", "api_gateway_502_guard", "NCLOUD_DIRECT_API_BASE", "NCLOUD_DIRECT_FALLBACK_ENABLED",
  "/api/integrations/profit/settlement-preview", "/api/scheduler/profit-analysis",
  "/api/integrations/coupang/products/options-sync", "COUPANG_PRODUCTS_PATH", "coupangProductOptionSync"
]);
if (!process.exitCode) pass("Worker bad patch removal checks passed");

for (const file of [".dev.vars.example", "apps/worker/.dev.vars.example", "wrangler.toml", "wrangler.toml.example"]) {
  const text = read(file);
  mustNotInclude(file, text, ["NCLOUD_DIRECT_API_BASE", "NCLOUD_DIRECT_FALLBACK_ENABLED", "COUPANG_PRODUCTS_PATH", "COUPANG_REVENUE_HISTORY_PATH", "COUPANG_SETTLEMENT_PATH", "TOSS_SETTLEMENT_PATH", "TOSS_SETTLEMENT_DATE_CONDITION"]);
}
if (!process.exitCode) pass("Environment examples and Wrangler config are cleaned");

const gitGuide = read("GITHUB_UPLOAD_GUIDE_V181.md");
mustInclude("GitHub upload guide", gitGuide, [
  "VITE_WORKER_URL=https://coupang-toss-b2b-automation.sosinche.workers.dev",
  "npm.cmd run verify:all",
  "npm.cmd run verify:git-safe",
  ".dev.vars"
]);
if (!process.exitCode) pass("GitHub upload guide and safety verifier exist");

const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";
function run(label, args) {
  console.log(`\n[VERIFY] ${label}`);
  const result = spawnSync(args[0], args.slice(1), { stdio: "inherit", shell: isWin });
  if (result.status !== 0) { console.error(`[FAIL] ${label}`); process.exit(result.status || 1); }
  console.log(`[PASS] ${label}`);
}
run("Web production build", [npmCmd, "--workspace", "apps/web", "run", "build"]);
run("Worker TypeScript check", ["npx", "tsc", "-p", "apps/worker/tsconfig.json", "--noEmit"]);
if (process.exitCode) process.exit(process.exitCode);
console.log("\n[PASS] V181 service verification completed.");
