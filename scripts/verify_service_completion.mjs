import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const requiredFiles = [
  "package.json",
  "README.md",
  "OPERATIONS_GUIDE_V185.md",
  "V185_RELEASE_NOTES.md",
  "DEPLOY_CLOUDFLARE_V185.md",
  "scripts/start_local_preview.mjs",
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
function section(text, start, end) {
  const startAt = text.indexOf(start);
  const endAt = text.indexOf(end, startAt + start.length);
  if (startAt < 0 || endAt < 0) {
    fail(`Could not isolate section: ${start} -> ${end}`);
    return "";
  }
  return text.slice(startAt, endAt);
}

console.log("[VERIFY] V185 browser-temporary shipment preview audit");
for (const file of requiredFiles) if (!existsSync(join(root, file))) fail(`Required file missing: ${file}`);
if (!process.exitCode) pass("Required project and deployment files exist");

const oldDocs = readdirSync(root).filter((name) => /V18[0-4]/.test(name));
if (oldDocs.length) fail(`Old release documents remain: ${oldDocs.join(", ")}`);
else pass("Old V180-V184 release documents are cleaned");

const pkg = JSON.parse(read("package.json"));
for (const script of ["dev:all", "build", "typecheck:worker", "verify:local", "verify:service", "check:env"]) {
  if (!pkg.scripts?.[script]) fail(`package.json script missing: ${script}`);
}
if (!String(pkg.version || "").includes("v185")) fail("package version is not v185");
const webPkg = JSON.parse(read("apps/web/package.json"));
if (!String(webPkg.version || "").includes("v185")) fail("web package version is not v185");
const workerPkg = JSON.parse(read("apps/worker/package.json"));
if (!String(workerPkg.version || "").includes("v185")) fail("worker package version is not v185");
if (!process.exitCode) pass("V185 package versions exist");

const app = read("apps/web/src/App.tsx");
mustInclude("App", app, [
  'APP_VERSION = "V185 업체송장 임시매칭·최종확인 운영본"',
  "temporaryVendorShipmentFiles",
  "temporaryVendorInvoiceRecords",
  "shipmentUploadPreview",
  "lastShipmentResultArtifacts",
  "handleVendorShipmentFilesToPurchase",
  "runShipmentUploadAll",
  "finalizeShipmentUpload",
  'source: "browser_temporary_vendor_shipments_v185"',
  'filename: "쿠팡_송장업로드결과.xlsx"',
  'filename: "토스_송장업로드결과.xlsx"',
  'filename: "미매칭_확인.xlsx"',
  'filename: "전체_처리결과.xlsx"',
  "결과 엑셀·ZIP 다시 다운로드",
  "서버·R2·Supabase에는 저장하지 않으며 새로고침하면 삭제됩니다",
]);
mustNotInclude("App", app, [
  "lastVendorShipmentFileNames",
  'APP_VERSION = "V184',
]);

const selectFlow = section(app, "async function handleVendorShipmentFilesToPurchase", "async function saveLocalFolderPath");
mustNotInclude("Vendor shipment selection", selectFlow, [
  "callLocalFolderHelper",
  "saveArtifactsStrictlyToLocalFolder",
  "/api/local/",
  "setInvoiceRecords(",
]);
mustInclude("Vendor shipment selection", selectFlow, [
  "setTemporaryVendorShipmentFiles(files)",
  "setTemporaryVendorInvoiceRecords(merged)",
]);

const previewFlow = section(app, "async function runShipmentUploadAll", "async function finalizeShipmentUpload");
mustNotInclude("Shipment preview", previewFlow, [
  "/api/integrations/shipments/upload-execute",
  "callLocalFolderHelper",
  "/api/local/",
]);
mustInclude("Shipment preview", previewFlow, [
  "collectPreparingOrdersForShipmentUpload()",
  "matchInvoices(",
  "setShipmentUploadPreview(preview)",
]);

const finalFlow = section(app, "async function finalizeShipmentUpload", "function downloadCouponTemplate");
mustInclude("Final shipment upload", finalFlow, [
  '/api/integrations/shipments/upload-execute',
  "buildShipmentResultArtifacts(preview, result)",
  "downloadShipmentResultArtifacts(artifacts)",
  "setTemporaryVendorShipmentFiles([])",
  "setTemporaryVendorInvoiceRecords([])",
]);
mustNotInclude("Final shipment upload", finalFlow, [
  "callLocalFolderHelper",
  "/api/local/",
  "downloadManagedZip",
]);
if (!process.exitCode) pass("Vendor shipment selection, preview and final upload are cleanly separated");

const style = read("apps/web/src/style.css");
mustInclude("Styles", style, [".shipment-temp-panel", ".shipment-preview-metrics", ".shipment-final-actions"]);

const worker = read("apps/worker/src/worker.ts");
mustInclude("Worker", worker, [
  'const DEFAULT_NCLOUD_FIXED_IP_API_BASE = "http://101.79.27.234.sslip.io:8080"',
  "cloudflare_worker_to_ncloud_fixed_ip_gateway_v185",
  "cloudflare_r2_purchase_folder_v185",
  "shipmentUploadExecute",
]);
if (!process.exitCode) pass("Worker keeps fixed-IP marketplace routing and V185 modes");

for (const file of [".dev.vars.example", "apps/worker/.dev.vars.example", "wrangler.toml", "wrangler.toml.example"]) {
  const text = read(file);
  mustNotInclude(file, text, ["trycloudflare.com"]);
}

const ncloudStarter = read("scripts/start_ncloud_api.mjs");
mustInclude("Ncloud build-only launcher", ncloudStarter, ['process.argv.includes("--build-only")']);
const ncloudServer = read("scripts/ncloud_node_server.ts");
mustInclude("Ncloud server", ncloudServer, [
  "const port = Number(process.env.PORT || 8080)",
  'const host = process.env.HOST || "0.0.0.0"',
  "V185에서는 업체송장 파일을 브라우저 앱에만 임시 보관하며 Ncloud는 고정 IP API 게이트웨이만 담당합니다.",
]);
const systemdInstaller = read("scripts/install_ncloud_systemd.sh");
mustInclude("systemd installer", systemdInstaller, ["Environment=PORT=8080", "Restart=always", "systemctl enable --now"]);
if (!process.exitCode) pass("Ncloud stays a minimal port-8080 fixed-IP gateway");

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
console.log("\n[PASS] V185 service verification completed.");
