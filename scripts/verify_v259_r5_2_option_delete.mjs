import fs from "node:fs";

const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

const checks = [
  [
    "optionId clear deletes existing mapping row",
    app.includes('if ("optionId" in patch && !cleanId(patch.optionId))') &&
      app.includes("void removeMappingRow(id)"),
  ],
  [
    "mapping deletion tombstone retained",
    app.includes("mappingDeletedKeysRef.current.add(key)"),
  ],
  [
    "mapping deletion removes local API link",
    app.includes(
      "adminplusProductLinks.filter((row) => row.id !== key)"
    ),
  ],
  [
    "mapping deletion closes active price alert",
    app.includes(
      "row.linkId === key && !row.acknowledgedAt"
    ),
  ],
  [
    "mapping deletion sends explicit API-link deletion",
    app.includes("adminplusProductLinkDeletedIds: [key]"),
  ],
  [
    "mapping deletion removes actual AdminPlus match",
    app.includes(
      '"/api/integrations/adminplus/catalog/matches/delete"'
    ) &&
      app.includes("existingApiLink.accountId") &&
      app.includes("existingApiLink.matchString"),
  ],
  [
    "worker accepts API-link deletion IDs",
    worker.includes(
      "const adminplusProductLinkDeletedIds = new Set("
    ),
  ],
  [
    "worker removes deleted API links after merge",
    worker.includes(
      "!adminplusProductLinkDeletedIds.has(id)"
    ),
  ],
  [
    "worker deletion command is not persisted",
    worker.includes(
      "delete data.adminplusProductLinkDeletedIds"
    ),
  ],
  [
    "R5.1 authority persistence retained",
    worker.includes(
      "v259-r5-1-authority-persistence-20260826"
    ),
  ],
  [
    "R5.2 web marker",
    app.includes(
      "v259-r5-2-option-delete-cascade-20260826"
    ),
  ],
  [
    "R5.2 worker marker",
    worker.includes(
      "v259-r5-2-option-delete-cascade-20260826"
    ),
  ],
  [
    "verify all includes R5.2",
    pkg.scripts["verify:all"].includes(
      "verify:v259r5.2"
    ),
  ],
];

let failed = 0;

for (const [name, ok] of checks) {
  console.log(ok ? "[PASS]" : "[FAIL]", name);
  if (!ok) failed++;
}

if (failed) process.exit(1);

console.log(
  "[PASS] V259 R5.2 option-delete cascade verification completed."
);
