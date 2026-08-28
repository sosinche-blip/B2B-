import fs from "node:fs";

const appPath = "apps/web/src/App.tsx";
const workerPath = "apps/worker/src/worker.ts";

let app = fs.readFileSync(appPath, "utf8");
let worker = fs.readFileSync(workerPath, "utf8");

function replaceExactlyOne(text, regex, replacement, label) {
  const flags = regex.flags.includes("g") ? regex.flags : regex.flags + "g";
  const counter = new RegExp(regex.source, flags);
  const matches = [...text.matchAll(counter)];

  if (matches.length !== 1) {
    throw new Error(
      `${label}: expected exactly 1 match, found ${matches.length}`
    );
  }

  return text.replace(regex, replacement);
}

/* =========================================================
 * 1. stale API unlink cleanup
 * ========================================================= */

app = replaceExactlyOne(
  app,
  /accountId:\s*\n\s*staleLink\.accountId,\s*\n\s*matchString:\s*\n\s*staleLink\.matchString,\s*\n\s*\}/,
  `accountId:
                  staleLink.accountId,
                matchString:
                  staleLink.matchString,
                confirm: true,
              }`,
  "staleLink AdminPlus delete confirm"
);

/* =========================================================
 * 2. API -> non-API vendor transition cleanup
 * ========================================================= */

app = replaceExactlyOne(
  app,
  /const deleted = await callApi\("\/api\/integrations\/adminplus\/catalog\/matches\/delete", \{ accountId: oldAccount\.id, matchString: link\.matchString \}\);/,
  `const deleted = await callApi("/api/integrations/adminplus/catalog/matches/delete", {
            accountId: oldAccount.id,
            matchString: link.matchString,
            confirm: true,
          });`,
  "API to non-API AdminPlus delete confirm"
);

/* =========================================================
 * 3. explicit mapping row deletion cleanup
 * ========================================================= */

app = replaceExactlyOne(
  app,
  /accountId: existingApiLink\.accountId,\s*\n\s*matchString: existingApiLink\.matchString,\s*\n\s*\}/,
  `accountId: existingApiLink.accountId,
              matchString: existingApiLink.matchString,
              confirm: true,
            }`,
  "removeMappingRow AdminPlus delete confirm"
);

/* =========================================================
 * 4. Worker: tombstone is authoritative for API links too
 * ========================================================= */

worker = replaceExactlyOne(
  worker,
  /return \(\s*\n\s*!id \|\|\s*\n\s*!adminplusProductLinkDeletedIds\.has\(id\)\s*\n\s*\);/,
  `return (
      !id ||
      (
        !tombstones[id] &&
        !adminplusProductLinkDeletedIds.has(id)
      )
    );`,
  "Worker tombstone AdminPlus-link guard"
);

/* =========================================================
 * 5. R5.6 marker
 * ========================================================= */

worker = replaceExactlyOne(
  worker,
  /\/\/ v259-r5-5-system-stability-20260828/,
  `// v259-r5-5-system-stability-20260828
// v259-r5-6-delete-tombstone-guard-20260828`,
  "R5.6 Worker marker"
);

fs.writeFileSync(appPath, app, "utf8");
fs.writeFileSync(workerPath, worker, "utf8");

console.log("[PASS] R5.6 source patch applied");