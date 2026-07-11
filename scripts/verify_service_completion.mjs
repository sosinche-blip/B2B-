import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const requiredFiles = [
  "package.json",
  "README.md",
  "OPERATIONS_GUIDE_V191.md",
  "V191_RELEASE_NOTES.md",
  "V191_REVIEW_REPORT.md",
  "DEPLOY_CLOUDFLARE_V191.md",
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

console.log("[VERIFY] V191 selected-order download and immediate coupon activation audit");
for (const file of requiredFiles) if (!existsSync(join(root, file))) fail(`Required file missing: ${file}`);
if (!process.exitCode) pass("Required V191 project and deployment files exist");

const staleDocs = readdirSync(root).filter((name) => /^(OPERATIONS_GUIDE|DEPLOY_CLOUDFLARE)_V(18[0-9]|190)|^V(18[0-9]|190)_(RELEASE_NOTES|REVIEW_REPORT)/.test(name));
if (staleDocs.length) fail(`Old V180-V190 release documents remain: ${staleDocs.join(", ")}`);
else pass("Old V180-V190 deployment documents are cleaned");

const pkg = JSON.parse(read("package.json"));
const webPkg = JSON.parse(read("apps/web/package.json"));
const workerPkg = JSON.parse(read("apps/worker/package.json"));
if (!String(pkg.version || "").includes("v191")) fail("root package version is not v191");
if (!String(webPkg.version || "").includes("v191")) fail("web package version is not v191");
if (!String(workerPkg.version || "").includes("v191")) fail("worker package version is not v191");
if (!process.exitCode) pass("V191 package versions exist");

const app = read("apps/web/src/App.tsx");
mustInclude("App", app, [
  'APP_VERSION = "V191 선택주문·쿠폰행입력·즉시활성 운영본"',
  "구매수량 ${Math.max(1, toNumber(row.qty, 1)).toLocaleString()}개",
  "downloadZip: true",
  "매칭자료 업체상품명",
  "상품명 입력",
  "할인값",
  "할인구분",
  "createImmediateNewCouponTemplate",
  "자동운영 활성화 시 즉시 생성·적용",
  "scheduleStartDate",
]);
mustNotInclude("App", app, [
  "신규 쿠폰 상품명",
  "신규 쿠폰명",
  "와우회원 전용",
  "신규 쿠폰 생성·적용</button>",
]);
if (!process.exitCode) pass("Selected-order quantity/download and coupon row-entry UI are connected");

const worker = read("apps/worker/src/worker.ts");
mustInclude("Worker", worker, [
  "scheduleStartDate?: string;",
  "couponTemplateScheduleStarted",
  ".filter((template) => couponTemplateScheduleStarted(template, nowDate))",
  "runCoupangCouponCancel",
  "pollCoupangCouponRequestStatus",
  "cloudflare_worker_to_ncloud_fixed_ip_gateway_v187",
]);
if (!process.exitCode) pass("Worker skips same-day scheduled replacement for immediately activated coupons");

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
console.log("\n[PASS] V191 service verification completed.");
