import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const requiredFiles = [
  "package.json",
  "README.md",
  "OPERATIONS_GUIDE_V198.md",
  "DEPLOY_V198_EASY.md",
  "V198_RELEASE_NOTES.md",
  "apps/web/src/App.tsx",
  "apps/web/src/style.css",
  "apps/web/src/utils/address.ts",
  "apps/worker/src/worker.ts",
  "apps/worker/src/address.ts",
  "scripts/verify_address_integrity.mjs",
  "scripts/verify_operation_control.mjs",
  "scripts/verify_v198_mapping_sync.mjs",
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

function fail(message) { console.error(`[FAIL] ${message}`); process.exitCode = 1; }
function pass(message) { console.log(`[PASS] ${message}`); }
function read(file) { return readFileSync(join(root, file), "utf8"); }
function mustInclude(name, text, snippets) {
  for (const snippet of snippets) if (!text.includes(snippet)) fail(`${name} missing required snippet: ${snippet}`);
}

console.log("[VERIFY] V198 mapping auto-sync, direct entry and operation audit");
for (const file of requiredFiles) if (!existsSync(join(root, file))) fail(`Required file missing: ${file}`);
if (!process.exitCode) pass("Required V198 project, regression and deployment files exist");

const staleDocs = readdirSync(root).filter((name) => /^(OPERATIONS_GUIDE|DEPLOY(?:_CLOUDFLARE)?)_V(18[0-9]|19[0-7])|^V(18[0-9]|19[0-7])_(RELEASE_NOTES|REVIEW_REPORT)/.test(name));
if (staleDocs.length) fail(`Old pre-V198 release documents remain: ${staleDocs.join(", ")}`);
else pass("Old pre-V198 deployment documents are cleaned");

for (const file of forbiddenCloudFiles) if (existsSync(join(root, file))) fail(`Cloud package still contains obsolete server/local file: ${file}`);
if (!process.exitCode) pass("Cloud package remains separated from the Ncloud gateway");

const pkg = JSON.parse(read("package.json"));
const webPkg = JSON.parse(read("apps/web/package.json"));
const workerPkg = JSON.parse(read("apps/worker/package.json"));
if (!String(pkg.version || "").includes("v198")) fail("root package version is not v198");
if (!String(webPkg.version || "").includes("v198")) fail("web package version is not v198");
if (!String(workerPkg.version || "").includes("v198")) fail("worker package version is not v198");
if (!process.exitCode) pass("V198 package versions exist");

const app = read("apps/web/src/App.tsx");
mustInclude("App", app, [
  'APP_VERSION = "V198 매핑 자동동기화·앱 직접등록 운영본"',
  "function renderOperationControlPanel()",
  "쿠팡+토스 주문조회",
  "async function loadMappingsFromServer",
  "async function syncMappingsToServer",
  "function registerMappingDirectly",
  "앱에서 신규 매핑 등록",
  "미매핑 주문에서 가져오기",
  "쿠팡 API 인증키 교체",
  "즉시 적용",
]);
if (!process.exitCode) pass("Web mapping sync and existing operations are present");

const worker = read("apps/worker/src/worker.ts");
mustInclude("Worker", worker, [
  'version: "v198-mapping-sync-direct-entry"',
  'path: "/api/operation/mappings/load"',
  'path: "/api/operation/mappings/upsert"',
  "async function upsertSharedMappings",
  "runCoupangCouponApply",
]);
if (!process.exitCode) pass("Worker retains current APIs and adds mapping-only synchronization");

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
run("Address integrity regression", ["node", "scripts/verify_address_integrity.mjs"]);
run("Operation control regression", ["node", "scripts/verify_operation_control.mjs"]);
run("V198 mapping sync regression", ["node", "scripts/verify_v198_mapping_sync.mjs"]);
if (process.env.VERIFY_SKIP_BUILD === "1") {
  console.log("[SKIP] Web build and Worker typecheck skipped by VERIFY_SKIP_BUILD=1");
} else {
  run("Web production build", [npmCmd, "--workspace", "apps/web", "run", "build"]);
  run("Worker TypeScript check", ["npx", "tsc", "-p", "apps/worker/tsconfig.json", "--noEmit"]);
}
if (process.exitCode) process.exit(process.exitCode);
console.log("\n[PASS] V198 service verification completed.");
