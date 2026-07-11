import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const requiredFiles = [
  "package.json",
  "README.md",
  "OPERATIONS_GUIDE_V192.md",
  "V192_RELEASE_NOTES.md",
  "V192_REVIEW_REPORT.md",
  "DEPLOY_CLOUDFLARE_V192.md",
  "apps/web/src/App.tsx",
  "apps/web/src/style.css",
  "apps/worker/src/worker.ts",
  "apps/worker/src/types.ts",
  "supabase/schema.sql",
  "supabase/migrations/20260710_v187_coupon_automation.sql",
];
const forbiddenCloudFiles = [
  "REPAIR_NCLOUD_SERVER.sh",
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

console.log("[VERIFY] V192 option-specific coupon and cloud-only cleanup audit");
for (const file of requiredFiles) if (!existsSync(join(root, file))) fail(`Required file missing: ${file}`);
if (!process.exitCode) pass("Required V192 project and deployment files exist");

const staleDocs = readdirSync(root).filter((name) => /^(OPERATIONS_GUIDE|DEPLOY_CLOUDFLARE)_V(18[0-9]|19[01])|^V(18[0-9]|19[01])_(RELEASE_NOTES|REVIEW_REPORT)/.test(name));
if (staleDocs.length) fail(`Old V180-V191 release documents remain: ${staleDocs.join(", ")}`);
else pass("Old V180-V191 deployment documents are cleaned");

for (const file of forbiddenCloudFiles) if (existsSync(join(root, file))) fail(`Cloud package still contains obsolete server/local file: ${file}`);
if (!process.exitCode) pass("Cloud package excludes obsolete Windows and Ncloud server files");

const pkg = JSON.parse(read("package.json"));
const webPkg = JSON.parse(read("apps/web/package.json"));
const workerPkg = JSON.parse(read("apps/worker/package.json"));
if (!String(pkg.version || "").includes("v192")) fail("root package version is not v192");
if (!String(webPkg.version || "").includes("v192")) fail("web package version is not v192");
if (!String(workerPkg.version || "").includes("v192")) fail("worker package version is not v192");
if (!process.exitCode) pass("V192 package versions exist");

const app = read("apps/web/src/App.tsx");
mustInclude("App", app, [
  'APP_VERSION = "V192 옵션별 쿠폰·클라우드 정리 운영본"',
  "couponName: string;",
  "쿠폰명 입력",
  "createImmediateNewCouponTemplates",
  "rollingTemplateId: templateKey",
  "작성한 상품명·쿠폰명·할인값·할인구분 그대로",
  "생성 실패",
  "선택 주문 수집",
]);
mustNotInclude("App", app, [
  "한 번에 등록할 옵션은 상품명 입력값을 동일하게 맞추세요.",
  "한 번에 등록할 옵션은 할인구분과 할인값을 동일하게 맞추세요.",
  "쿠폰양식 다운로드",
  "쿠폰양식 등록",
  "쿠팡 판매가 동기화",
  "START_HERE_WINDOWS.cmd",
  "8791",
]);
if (!process.exitCode) pass("Option-specific coupon input and streamlined UI are connected");

const functionNames = [...app.matchAll(/^\s*(?:async\s+)?function\s+(\w+)\s*\(/gm)].map((match) => match[1]);
const deadFunctions = [...new Set(functionNames)].filter((name) => (app.match(new RegExp(`\\b${name}\\b`, "g")) || []).length === 1);
if (deadFunctions.length) fail(`Unused function declarations remain: ${deadFunctions.join(", ")}`);
else pass("No textually unreferenced function declarations remain");

const worker = read("apps/worker/src/worker.ts");
mustInclude("Worker", worker, [
  'version: "v192-option-specific-coupon-cleanup"',
  "function couponGroupKey",
  "displayText(row.rollingTemplateId)",
  "displayText(row.couponName)",
  "String(profitNumber(row.discountValue))",
  "runCoupangCouponApply",
]);
if (!process.exitCode) pass("Worker preserves independent coupon grouping and fixed-IP gateway routing");

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
if (process.exitCode) process.exit(process.exitCode);
console.log("\n[PASS] V192 service verification completed.");
