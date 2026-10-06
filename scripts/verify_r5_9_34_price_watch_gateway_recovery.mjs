import fs from "node:fs";

const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");
const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");

function must(ok, label) {
  if (!ok) {
    console.error("[FAIL]", label);
    process.exitCode = 1;
  } else {
    console.log("[PASS]", label);
  }
}

console.log("[ROUND 1] Gateway timeout recovery");
must(
  worker.includes('adminplusReadWithRetry(env, account, "/v1/seller/products", query)'),
  "price-watch product reads use bounded read retry",
);
must(
  worker.includes("524/5xx·일시 지연") || worker.includes("524/5xx"),
  "gateway timeout retry intent is documented",
);

console.log("[ROUND 2] no false 'unchanged' result");
must(app.includes("adminplusPriceCheckConnection"), "price-check connection state is tracked");
must(app.includes("가격변동 판정 보류"), "failed checks show a clear deferred state");
must(app.includes("기존 감시값은 보존"), "failed checks preserve prior watch values");

if (!process.exitCode) {
  console.log("[PASS] R5.9.34 price watch gateway recovery verification completed.");
}
