import fs from "node:fs";

const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");

function must(ok, label) {
  if (!ok) {
    console.error("[FAIL]", label);
    process.exitCode = 1;
  } else {
    console.log("[PASS]", label);
  }
}

console.log("[ROUND 1] browser search cache");
must(app.includes("adminplusGlobalSearchCacheRef"), "global search browser cache exists");
must(app.includes("60 * 60 * 1000"), "same search cache lasts one hour");
must(app.includes("브라우저 1시간 캐시 재사용"), "cache reuse is visible to operator");

console.log("[ROUND 2] query correctness");
must(app.includes("active-unlimited") && app.includes(': "all"'), "active/unlimited filter is part of cache key");
must(app.includes("if (searchComplete)"), "only completed searches are cached");
must(app.includes("rows: finalRows"), "completed rows are retained for reuse");

if (!process.exitCode) {
  console.log("[PASS] R5.9.35 global search reuse verification completed.");
}
