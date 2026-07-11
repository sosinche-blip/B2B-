import { spawnSync } from "node:child_process";

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
run("Address integrity regression", ["node", "scripts/verify_address_integrity.mjs"]);
run("Preparing-order selection regression", ["node", "scripts/verify_preparing_order_collection.mjs"]);

console.log("\n[PASS] Local project verification completed.");
console.log("Payment orders keep the purchase ZIP flow; preparing orders are collected only for shipment matching and upload.");
