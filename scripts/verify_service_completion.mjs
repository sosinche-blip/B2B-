import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const requiredFiles = [
  "package.json",
  "README.md",
  "OPERATIONS_GUIDE_V190.md",
  "V190_RELEASE_NOTES.md",
  "V190_REVIEW_REPORT.md",
  "DEPLOY_CLOUDFLARE_V190.md",
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

console.log("[VERIFY] V190 coupon product-name, selected cancellation and UI cleanup audit");
for (const file of requiredFiles) if (!existsSync(join(root, file))) fail(`Required file missing: ${file}`);
if (!process.exitCode) pass("Required V190 project and deployment files exist");

const staleDocs = readdirSync(root).filter((name) => /^(OPERATIONS_GUIDE|DEPLOY_CLOUDFLARE)_V18[0-9]|^V18[0-9]_(RELEASE_NOTES|REVIEW_REPORT)/.test(name));
if (staleDocs.length) fail(`Old V180-V189 release documents remain: ${staleDocs.join(", ")}`);
else pass("Old V180-V189 deployment documents are cleaned");

const pkg = JSON.parse(read("package.json"));
const webPkg = JSON.parse(read("apps/web/package.json"));
const workerPkg = JSON.parse(read("apps/worker/package.json"));
if (!String(pkg.version || "").includes("v190")) fail("root package version is not v190");
if (!String(webPkg.version || "").includes("v190")) fail("web package version is not v190");
if (!String(workerPkg.version || "").includes("v190")) fail("worker package version is not v190");
if (!process.exitCode) pass("V190 package versions exist");

const app = read("apps/web/src/App.tsx");
mustInclude("App", app, [
  'APP_VERSION = "V190 쿠폰상품명·선택취소·UI정리 운영본"',
  "productName: string;",
  "신규 쿠폰 상품명",
  "신규 쿠폰 상품명을 입력하세요.",
  "fetchCancelableCouponList",
  "cancelSelectedActiveOrStandbyCoupons",
  "활성·대기 쿠폰 조회",
  "선택 쿠폰 취소",
  "if (!selectedCount && !shipmentUploadPreview) return null;",
]);
mustNotInclude("App", app, [
  "업체송장 앱 임시저장",
  "즉시 24시간 쿠폰 생성",
  "즉시 직전쿠폰 취소",
]);
if (!process.exitCode) pass("Shipment explanation cleanup, product name input and explicit selected cancellation are connected");

const worker = read("apps/worker/src/worker.ts");
mustInclude("Worker", worker, [
  "templateIds = Array.isArray(body.templateIds)",
  'retryQuery.in("template_id", templateIds)',
  "runCoupangCouponCancel",
  "pollCoupangCouponRequestStatus",
  "cloudflare_worker_to_ncloud_fixed_ip_gateway_v187",
]);
if (!process.exitCode) pass("Worker can cancel retries only for selected coupon templates");

const ncloudServer = read("scripts/ncloud_node_server.ts");
mustInclude("Ncloud gateway", ncloudServer, [
  "V187 fixed-IP gateway",
  "No UI or B2B file storage is enabled.",
  "COUPANG_COUPON_CREATE_PATH",
]);
mustNotInclude("Ncloud gateway", ncloudServer, ["listManagedFiles", "save-many", "read-file"]);
if (!process.exitCode) pass("Ncloud remains the minimal V187 fixed-IP gateway");

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
console.log("\n[PASS] V190 service verification completed.");
