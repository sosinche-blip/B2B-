import fs from "node:fs";

const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");

const deleteRoute =
  '"/api/integrations/adminplus/catalog/matches/delete"';

const positions = [];
let cursor = 0;

while (true) {
  const index = app.indexOf(deleteRoute, cursor);
  if (index < 0) break;
  positions.push(index);
  cursor = index + deleteRoute.length;
}

const checks = [
  [
    "exactly 3 Web AdminPlus delete calls",
    positions.length === 3,
  ],
  [
    "all AdminPlus delete calls use confirm true",
    positions.every((index) => {
      const window = app.slice(index, index + 550);
      return window.includes("confirm: true");
    }),
  ],
  [
    "explicit mapping delete keeps deletion IDs",
    app.includes("adminplusProductLinkDeletedIds: [key]"),
  ],
  [
    "Worker uses mapping tombstone for API-link blocking",
    worker.includes("!tombstones[id] &&") &&
      worker.includes("!adminplusProductLinkDeletedIds.has(id)"),
  ],
  [
    "mapping tombstones remain persistent",
    worker.includes(
      "mappingTombstones: pruneMappingTombstones(tombstones)"
    ),
  ],
  [
    "stale mappings still filtered by tombstone timestamps",
    worker.includes("incomingMappingsAfterTombstones("),
  ],
  [
    "R5.5 system stability retained",
    worker.includes(
      "v259-r5-5-system-stability-20260828"
    ),
  ],
  [
    "R5.6 marker",
    worker.includes(
      "v259-r5-6-delete-tombstone-guard-20260828"
    ),
  ],
];

let failed = 0;

for (const [name, ok] of checks) {
  if (ok) {
    console.log(`[PASS] ${name}`);
  } else {
    console.error(`[FAIL] ${name}`);
    failed += 1;
  }
}

if (failed) {
  throw new Error(
    `R5.6 verification failed: ${failed} check(s)`
  );
}

console.log(
  "\n[PASS] V259 R5.6 delete/tombstone guard verification completed."
);