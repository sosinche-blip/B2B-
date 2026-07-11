import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const required = [
  "package.json",
  "package-lock.json",
  ".npmrc",
  ".dev.vars.example",
  "README.md",
  "REPAIR_NCLOUD_GATEWAY.sh",
  "scripts/install_ncloud_systemd.sh",
  "scripts/start_ncloud_api.mjs",
  "scripts/ncloud_node_server.ts",
  "apps/worker/src/worker.ts",
  "apps/worker/src/types.ts",
  "apps/worker/src/address.ts",
  "scripts/verify_address_integrity.mjs",
];
let failed = false;
const fail = (msg) => { console.error(`[FAIL] ${msg}`); failed = true; };
const pass = (msg) => console.log(`[PASS] ${msg}`);
for (const file of required) if (!existsSync(join(root, file))) fail(`Missing ${file}`);
if (!existsSync(join(root, "apps/web"))) pass("Web UI is excluded from the Ncloud package");
else fail("apps/web must not be included");
const lock = readFileSync(join(root, "package-lock.json"), "utf8");
if (/applied-caas|internal\.api\.openai|artifactory/.test(lock)) fail("Internal package registry remains in package-lock.json");
else pass("package-lock.json uses public npm registry URLs");
const server = readFileSync(join(root, "scripts/ncloud_node_server.ts"), "utf8");
if (!server.includes("V193 fixed-IP gateway")) fail("V193 gateway marker missing");
if (/listManagedFiles|save-many|read-file/.test(server)) fail("Local file storage code remains in the Node wrapper");
else pass("Node wrapper is limited to fixed-IP API execution");
const worker = readFileSync(join(root, "apps/worker/src/worker.ts"), "utf8");
if (!worker.includes('version: "v193-address-integrity"')) fail("V193 worker version missing");
else pass("V193 API worker is included");
if (failed) process.exit(1);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const addressResult = spawnSync(npm, ["run", "verify:address"], { stdio: "inherit", shell: process.platform === "win32" });
if (addressResult.status !== 0) process.exit(addressResult.status || 1);
const result = spawnSync(npm, ["run", "build:ncloud"], { stdio: "inherit", shell: process.platform === "win32" });
if (result.status !== 0) process.exit(result.status || 1);
console.log("[PASS] Ncloud V193 gateway verification completed");
