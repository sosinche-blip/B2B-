import fs from "node:fs";

const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");

function must(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`[PASS] ${message}`);
}

console.log("[ROUND 1] manual shipment server source-of-truth");

must(
  worker.includes("V259: manual shipment preflight/sync uses the same server-confirmed state"),
  "V259 manual shipment marker"
);

must(
  worker.includes("const serverPayload = await loadLatestSchedulerPayload(env);"),
  "manual shipment loads server scheduler payload"
);

must(
  worker.includes(
    'for (const protectedKey of ["mappings", "adminplusProductLinks", "adminplusPurchaseHistory", "tossOptionMaster", "tossOptionBridgeRows"])'
  ),
  "manual shipment protects server-confirmed runtime collections"
);

must(
  worker.includes(
    "if (serverPayload[protectedKey] !== undefined) payload[protectedKey] = serverPayload[protectedKey];"
  ),
  "browser history cannot overwrite server history"
);

must(
  worker.includes(
    "payload.adminplusAutomation = { ...objectRecord(serverPayload.adminplusAutomation), ...objectRecord(incoming.adminplusAutomation) };"
  ),
  "fresh UI automation settings may still overlay server settings"
);

must(
  !worker.includes(
    'const payload = Object.keys(objectRecord(body.data)).length ? objectRecord(body.data) : await loadLatestSchedulerPayload(env);\n  const result = await adminplusShipmentRun(env, payload, dryRun);'
  ),
  "legacy browser-first shipment payload removed"
);

console.log("[ROUND 2] automatic scheduler regression");

must(
  worker.includes("const result = await adminplusShipmentRun(env, savedPayload, false);"),
  "automatic shipment scheduler still uses saved server payload"
);

must(
  worker.includes('url.pathname === "/api/integrations/adminplus/shipments/sync"'),
  "manual shipment sync endpoint retained"
);

must(
  worker.includes('url.pathname === "/api/integrations/adminplus/shipments/preflight"'),
  "shipment preflight endpoint retained"
);

must(
  worker.includes("await saveLatestSchedulerPayload(env, payload);"),
  "successful manual shipment persists refreshed server history"
);

console.log("");
console.log("[PASS] V259 manual shipment server-truth verification completed.");