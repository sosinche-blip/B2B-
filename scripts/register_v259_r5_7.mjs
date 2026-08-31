import fs from "node:fs";

const path = "package.json";
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));

pkg.scripts ??= {};

pkg.scripts["verify:v259r5.7"] =
  "node scripts/verify_v259_r5_7_same_vendor_link_recovery.mjs";

const current = String(pkg.scripts["verify:all"] || "");

if (!current) {
  throw new Error("verify:all missing");
}

if (!current.includes("npm run verify:v259r5.6")) {
  throw new Error("R5.6 verify anchor missing");
}

if (!current.includes("npm run verify:v259r5.7")) {
  pkg.scripts["verify:all"] =
    current.replace(
      "npm run verify:v259r5.6",
      "npm run verify:v259r5.6 && npm run verify:v259r5.7"
    );
}

fs.writeFileSync(
  path,
  JSON.stringify(pkg, null, 2) + "\n",
  "utf8"
);

console.log("[PASS] verify:v259r5.7 registered");
console.log("[PASS] verify:all includes R5.7");