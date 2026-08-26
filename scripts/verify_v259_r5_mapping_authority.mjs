import fs from "node:fs";

const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

const checks = [
  ["authority fields", app.includes('matchAuthority?: "excel" | "api"')],
  ["Excel authority", app.includes('matchAuthority: "excel" as const')],
  ["API authority", app.includes('matchAuthority: "api" as const')],
  ["legacy timestamp", app.includes("apiWins = linkTime >= mappingTime")],
  ["worker authority", worker.includes('if (mappingAuthority === "excel") return false')],
  ["worker parser", worker.includes('matchAuthority: String(row.matchAuthority || "").trim().toLowerCase()')],
  ["mapping authority survives persistent normalization",
    /function normalizeMappingRecord[\s\S]{0,2200}matchAuthority:[\s\S]{0,600}matchConfirmedAt:[\s\S]{0,600}updatedAt:/.test(worker)],
  ["R5.1 persistence marker",
    worker.includes("v259-r5-1-authority-persistence-20260826")],
  ["R4.5 retained", worker.includes("v259-r4-5-adaptive-adminplus-cash-receipt-20260820")],
  ["R5 marker", worker.includes("v259-r5-last-confirmed-wins-20260826")],
  ["verify all R5", pkg.scripts["verify:all"].includes("verify:v259r5")],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(ok ? "[PASS]" : "[FAIL]", name);
  if (!ok) failed++;
}

if (failed) process.exit(1);
console.log("[PASS] V259 R5 verification completed.");
