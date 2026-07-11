import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const requiredFiles = [
  "package.json",
  "README.md",
  "OPERATIONS_GUIDE_V189.md",
  "V189_RELEASE_NOTES.md",
  "V189_REVIEW_REPORT.md",
  "DEPLOY_CLOUDFLARE_V189.md",
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

console.log("[VERIFY] V189 coupon option lookup, new registration and amount-change audit");
for (const file of requiredFiles) if (!existsSync(join(root, file))) fail(`Required file missing: ${file}`);
if (!process.exitCode) pass("Required V189 project and deployment files exist");

const staleDocs = readdirSync(root).filter((name) => /^(OPERATIONS_GUIDE|DEPLOY_CLOUDFLARE|V\d+_(RELEASE_NOTES|REVIEW_REPORT))_V18[0-8]/.test(name));
if (staleDocs.length) fail(`Old release documents remain: ${staleDocs.join(", ")}`);
else pass("Old V180-V188 deployment documents are cleaned");

const pkg = JSON.parse(read("package.json"));
const webPkg = JSON.parse(read("apps/web/package.json"));
const workerPkg = JSON.parse(read("apps/worker/package.json"));
if (!String(pkg.version || "").includes("v189")) fail("root package version is not v189");
if (!String(webPkg.version || "").includes("v189")) fail("web package version is not v189");
if (!String(workerPkg.version || "").includes("v189")) fail("worker package version is not v189");
if (!process.exitCode) pass("V189 package versions exist");

const app = read("apps/web/src/App.tsx");
mustInclude("App", app, [
  'APP_VERSION = "V189 옵션ID 조회·신규쿠폰·금액변경 운영본"',
  "lookupCouponOptionIds",
  "runNewCouponPreflight",
  "createNewCouponAndRegisterTemplate",
  "saveRollingCouponTemplateChanges",
  "API 옵션ID 조회·신규 쿠폰 등록",
  "다음 발행부터 적용",
  "newCouponPreflightIssues",
  "maxDiscountPrice",
  "wowExclusive",
]);
if (!process.exitCode) pass("Option lookup, new coupon registration and next-issue amount editing are connected");

const css = read("apps/web/src/style.css");
mustInclude("Style", css, [
  ".coupon-new-registration-box",
  ".coupon-new-grid",
  ".coupon-preflight-pass",
  ".coupon-preflight-fail",
]);
if (!process.exitCode) pass("V189 coupon registration UI styles exist");

const worker = read("apps/worker/src/worker.ts");
mustInclude("Worker", worker, [
  "coupangVendorItemPriceSync",
  "couponActionPreview",
  "pollCoupangCouponRequestStatus",
  "coupon_automation_retries",
  "coupon_automation_failures",
  "cloudflare_worker_to_ncloud_fixed_ip_gateway_v187",
]);
if (!process.exitCode) pass("V189 reuses fixed-IP option lookup and coupon action backend safely");

const ncloudServer = read("scripts/ncloud_node_server.ts");
mustInclude("Ncloud gateway", ncloudServer, [
  "V187 fixed-IP gateway",
  "No UI or B2B file storage is enabled.",
  "COUPANG_VENDOR_ITEM_INVENTORY_PATH",
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
console.log("\n[PASS] V189 service verification completed.");
