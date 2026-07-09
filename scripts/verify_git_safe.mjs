import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const forbidden = [
  ".env",
  ".env.local",
  ".dev.vars",
  "apps/worker/.dev.vars",
];
const requiredIgnored = [".env", ".env.local", ".dev.vars", "apps/worker/.dev.vars"];
let failed = false;
function fail(message) { console.error(`[FAIL] ${message}`); failed = true; }
function pass(message) { console.log(`[PASS] ${message}`); }

console.log("[VERIFY] GitHub upload safety check");
for (const file of forbidden) {
  if (existsSync(join(root, file))) {
    fail(`Sensitive runtime file exists in project root and must not be uploaded: ${file}`);
  }
}
const gitignorePath = join(root, ".gitignore");
if (!existsSync(gitignorePath)) {
  fail(".gitignore is missing");
} else {
  const text = readFileSync(gitignorePath, "utf8");
  for (const pattern of requiredIgnored) {
    if (!text.includes(pattern)) fail(`.gitignore does not include ${pattern}`);
  }
}
if (!failed) {
  pass("No local secret files were found and .gitignore contains required patterns.");
  console.log("[PASS] GitHub upload safety check completed.");
} else {
  process.exit(1);
}

const lockText = readFileSync("package-lock.json", "utf8");
if (lockText.includes("packages.applied-caas-gateway1.internal.api.openai.org")) {
  fail("package-lock.json contains internal OpenAI registry URL. Replace resolved URLs with https://registry.npmjs.org/ before GitHub upload.");
}
pass("package-lock public npm registry check passed");
