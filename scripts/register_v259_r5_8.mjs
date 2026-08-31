import fs from "node:fs";

const path = "package.json";

const pkg =
  JSON.parse(fs.readFileSync(path, "utf8"));

pkg.scripts ??= {};

pkg.scripts["verify:v259r5.8"] =
  "node scripts/verify_v259_r5_8_system_stability_hardening.mjs";

const all =
  String(pkg.scripts["verify:all"] || "");

if (
  !all.includes(
    "npm run verify:v259r5.7"
  )
) {
  throw new Error(
    "verify:all R5.7 anchor missing"
  );
}

if (
  !all.includes(
    "npm run verify:v259r5.8"
  )
) {
  pkg.scripts["verify:all"] =
    all.replace(
      "npm run verify:v259r5.7",
      "npm run verify:v259r5.7 && npm run verify:v259r5.8"
    );
}

fs.writeFileSync(
  path,
  JSON.stringify(pkg, null, 2) + "\n",
  "utf8"
);

console.log("[PASS] R5.8 verifier registered");