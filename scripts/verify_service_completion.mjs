import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const requiredFiles = [
  "package.json",
  "README.md",
  "OPERATIONS_GUIDE_V187.md",
  "V187_RELEASE_NOTES.md",
  "V187_REVIEW_REPORT.md",
  "DEPLOY_CLOUDFLARE_V187.md",
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

console.log("[VERIFY] V187 coupon 24-hour automation safety audit");
for (const file of requiredFiles) if (!existsSync(join(root, file))) fail(`Required file missing: ${file}`);
if (!process.exitCode) pass("Required project, migration and deployment files exist");

const staleDocs = readdirSync(root).filter((name) => /^(OPERATIONS_GUIDE|DEPLOY_CLOUDFLARE|V\d+_RELEASE_NOTES)_V18[0-6]/.test(name));
if (staleDocs.length) fail(`Old release documents remain: ${staleDocs.join(", ")}`);
else pass("Old V180-V186 deployment documents are cleaned");

const pkg = JSON.parse(read("package.json"));
const webPkg = JSON.parse(read("apps/web/package.json"));
const workerPkg = JSON.parse(read("apps/worker/package.json"));
if (!String(pkg.version || "").includes("v187")) fail("root package version is not v187");
if (!String(webPkg.version || "").includes("v187")) fail("web package version is not v187");
if (!String(workerPkg.version || "").includes("v187")) fail("worker package version is not v187");
if (!process.exitCode) pass("V187 package versions exist");

const app = read("apps/web/src/App.tsx");
mustInclude("App", app, [
  'APP_VERSION = "V187 쿠폰 24시간 자동운영 안전본"',
  "couponPreflight: { enabled: true, time: \"23:45\" }",
  "runCouponAutomationPreflight",
  "activateCouponAutomation",
  "stopCouponAutomation",
  'callApi("/api/operation/coupon-automation/stop"',
  "fetchCouponAutomationFailures",
  "manualRetryCouponAutomationFailure",
  "토스쇼핑은 현재 공개 API 목록에 쿠폰·프로모션 생성/취소 기능이 없어",
  'source: "browser_temporary_vendor_shipments_v187"',
]);
mustNotInclude("App", app, [
  'APP_VERSION = "V186',
  "토스 쿠폰 자동운영을 실행합니다",
]);
if (!process.exitCode) pass("Coupon preflight, activation, stop and failure UI are connected");

const worker = read("apps/worker/src/worker.ts");
mustInclude("Worker", worker, [
  'SERVER_OPERATION_SQL_FILE =\n  "supabase/migrations/20260710_v187_coupon_automation.sql"',
  'couponPreflight?.time || "23:45"',
  "23:50~23:55",
  "23:51~23:56",
  "pollCoupangCouponRequestStatus",
  'stage: "request_status"',
  "중복 쿠폰을 만들지 않고 30분 뒤 요청상태만 최종 확인",
  "coupon_automation_retries",
  "coupon_automation_failures",
  "couponAutomationStop",
  'status: "cancelled"',
  "30분 뒤 3차 최종 재시도",
  "cancel_window_missed",
  "apply_window_missed",
  "cloudflare_worker_to_ncloud_fixed_ip_gateway_v187",
  "cloudflare_r2_purchase_folder_v187",
  "toss_coupon_automation_unavailable_v187",
]);
mustNotInclude("Worker", worker, [
  "if (options.length > limit) issues.push",
  "cloudflare_worker_to_ncloud_fixed_ip_gateway_v186",
]);
if (!process.exitCode) pass("Worker contains durable, isolated and status-confirmed coupon automation");

const types = read("apps/worker/src/types.ts");
mustInclude("Worker types", types, ["COUPANG_COUPON_PREFLIGHT_ITEM_LIMIT?: string"]);

const migration = read("supabase/migrations/20260710_v187_coupon_automation.sql");
mustInclude("Migration", migration, [
  "create table if not exists public.coupon_automation_retries",
  "create table if not exists public.coupon_automation_failures",
  "retry_key text not null unique",
  "failure_key text not null unique",
]);

const ncloudServer = read("scripts/ncloud_node_server.ts");
mustInclude("Ncloud gateway", ncloudServer, [
  "V187 fixed-IP gateway",
  "No UI or B2B file storage is enabled.",
  "V187 Ncloud는 고정 IP 마켓 API 실행과 쿠폰 스케줄 실행만 담당",
]);
mustNotInclude("Ncloud gateway", ncloudServer, [
  "listManagedFiles",
  "save-many",
  "read-file",
]);
if (!process.exitCode) pass("Ncloud code is limited to the fixed-IP API gateway role");

for (const file of [".dev.vars.example", "apps/worker/.dev.vars.example", "wrangler.toml", "wrangler.toml.example"]) {
  const text = read(file);
  mustInclude(file, text, ["COUPANG_COUPON_PREFLIGHT_ITEM_LIMIT"]);
  mustNotInclude(file, text, ["trycloudflare.com"]);
}

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
console.log("\n[PASS] V187 service verification completed.");
