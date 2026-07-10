import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const requiredFiles = [
  "package.json",
  "README.md",
  "DEPLOYMENT_GUIDE_V169.md",
  "MOBILE_OPERATION_CHECKLIST_V169.md",
  "V169_RELEASE_NOTES.md",
  "scripts/start_local_preview.mjs",
  "scripts/local_folder_helper.mjs",
  "scripts/check_dev_vars.mjs",
  "scripts/verify_local_project.mjs",
  "apps/web/src/App.tsx",
  "apps/web/src/style.css",
  "apps/worker/src/worker.ts",
  "apps/worker/src/types.ts",
  "supabase/schema.sql",
  "START_HERE_WINDOWS.cmd",
  "START_SAFE_MODE_WINDOWS.cmd",
  "DIAGNOSE_SERVER_WINDOWS.cmd",
];
function fail(message) { console.error(`[FAIL] ${message}`); process.exitCode = 1; }
function pass(message) { console.log(`[PASS] ${message}`); }
function read(file) { return readFileSync(join(root, file), "utf8"); }
function mustInclude(name, text, snippets) { for (const snippet of snippets) if (!text.includes(snippet)) fail(`${name} missing required snippet: ${snippet}`); }
function mustNotInclude(name, text, snippets) { for (const snippet of snippets) if (text.includes(snippet)) fail(`${name} still contains removed snippet: ${snippet}`); }

console.log("[VERIFY] V175 server mapping save audit");
for (const file of requiredFiles) if (!existsSync(join(root, file))) fail(`Required file missing: ${file}`);
if (!process.exitCode) pass("Required project and deployment files exist");
const oldNotes = readdirSync(root).filter((name) => /^V\d+_NOTES\.md$/.test(name) && name !== "V169_RELEASE_NOTES.md");
if (oldNotes.length) fail(`Old version notes were not cleaned: ${oldNotes.join(", ")}`);
else pass("Old version notes are cleaned");

const pkg = JSON.parse(read("package.json"));
for (const script of ["dev:all", "build", "typecheck:worker", "verify:local", "verify:service", "check:env"]) if (!pkg.scripts?.[script]) fail(`package.json script missing: ${script}`);
if (!String(pkg.version || "").includes("v175")) fail("package version is not v175");
const webPkg = JSON.parse(read("apps/web/package.json"));
if (!String(webPkg.version || "").includes("v175")) fail("web package version is not v175");
const workerPkg = JSON.parse(read("apps/worker/package.json"));
if (!String(workerPkg.version || "").includes("v175")) fail("worker package version is not v175");
if (!process.exitCode) pass("V175 package versions exist");

const app = read("apps/web/src/App.tsx");
mustInclude("App", app, [
  'APP_VERSION = "V175 서버 매핑저장 안정화"',
  '"간편운영"', '"주문관리"', '"매핑관리"', '"양식설정"', '"발주관리"', '"쿠폰관리"', '"스케줄러"', '"운영설정"',
  'handleVendorShipmentFilesToPurchase',
  'runShipmentUploadAll',
  'applySelectedCouponsAsRollingTemplates',
  'rollingCouponTemplates',
]);
mustNotInclude("App", app, [
  'activeMenu === "순이익"', 'setActiveMenu("순이익")', '"순이익",',
  'runProfitSettlementPreview', 'runProfitSchedulerSnapshot', 'collectProfitSalesOrders',
  '농수산물 무료배송값', '수수료 반영', '기존 판매내역 조회',
  'syncCoupangOptionMastersFromApi', 'coupangOptionRowsFromApiResult',
]);
if (!process.exitCode) pass("Web app keeps required menus and removes dead profit/product-option actions");

const worker = read("apps/worker/src/worker.ts");
mustInclude("Worker", worker, [
  "scheduler_run_preview_only_v147", "scheduler_tick_v147", "dailyRollingCouponMode", "rollingTemplates", "shipmentUploadExecute",
]);
mustNotInclude("Worker", worker, [
  "/api/integrations/profit/settlement-preview", "/api/scheduler/profit-analysis",
  "/api/integrations/coupang/products/options-sync", "COUPANG_PRODUCTS_PATH", "coupangProductOptionSync",
]);
if (!process.exitCode) pass("Worker removed profit APIs and dead Coupang product option endpoint");

for (const file of [".dev.vars.example", "apps/worker/.dev.vars.example", "wrangler.toml", "wrangler.toml.example"]) {
  const text = read(file);
  mustNotInclude(file, text, ["COUPANG_PRODUCTS_PATH", "COUPANG_REVENUE_HISTORY_PATH", "COUPANG_SETTLEMENT_PATH", "TOSS_SETTLEMENT_PATH", "TOSS_SETTLEMENT_DATE_CONDITION"]);
}
if (!process.exitCode) pass("Environment examples and Wrangler config are cleaned");

const helper = read("scripts/local_folder_helper.mjs");
mustInclude("local folder helper", helper, ["unifiedPurchaseFolder", "B2B_발주폴더"]);
mustNotInclude("local folder helper", helper, ["B2B_업로드폴더"]);
if (!process.exitCode) pass("Local folder helper is unified to the purchase folder");

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
console.log("\n[PASS] V175 service verification completed.");
