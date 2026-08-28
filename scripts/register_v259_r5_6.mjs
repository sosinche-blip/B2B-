import fs from "node:fs";

const path = "package.json";

const pkg = JSON.parse(
  fs.readFileSync(path, "utf8")
);

pkg.scripts ??= {};

pkg.scripts["verify:v259r5.6"] =
  "node scripts/verify_v259_r5_6_delete_tombstone_guard.mjs";

const verifyAll = String(
  pkg.scripts["verify:all"] || ""
);

if (!verifyAll) {
  throw new Error("verify:all script missing");
}

if (!verifyAll.includes("npm run verify:v259r5.5")) {
  throw new Error(
    "verify:all R5.5 anchor missing"
  );
}

if (!verifyAll.includes("npm run verify:v259r5.6")) {
  pkg.scripts["verify:all"] =
    verifyAll.replace(
      "npm run verify:v259r5.5",
      "npm run verify:v259r5.5 && npm run verify:v259r5.6"
    );
}

fs.writeFileSync(
  path,
  JSON.stringify(pkg, null, 2) + "\n",
  "utf8"
);

console.log(
  "[PASS] verify:v259r5.6 registered"
);

console.log(
  "[PASS] verify:all includes R5.6"
);