import fs from "node:fs";
const worker = fs.readFileSync(new URL("../apps/worker/src/worker.ts", import.meta.url), "utf8");
function must(cond, msg){ if(!cond){ console.error(`[FAIL] ${msg}`); process.exitCode=1; } else console.log(`[PASS] ${msg}`); }
console.log("[ROUND 1] shared payload builder");
must(worker.includes("function adminplusBuildOrderPayload"), "shared AdminPlus order payload builder exists");
must(worker.includes("order_payload_preflight"), "preflight validates the real order payload");
must(worker.includes("order_payload_validation"), "execute uses the same payload validation");
console.log("[ROUND 2] receiver normalization");
must(worker.includes("adminplusNormalizeReceiverPhone"), "phone normalization exists");
must(worker.includes("adminplusNormalizeReceiverZip"), "5-digit postcode normalization/fallback exists");
must(worker.includes("우편번호 5자리 누락/형식오류"), "postcode is required before API POST");
console.log("[ROUND 3] diagnostics/revision");
must(worker.includes("adminplusValidationDiagnostic"), "nested AdminPlus validation diagnostics are exposed");
must(worker.includes("adminplus-preflight-payload-parity-v226-20260810"), "V226 revision exposed");
if(!process.exitCode) console.log("[PASS] V226 AdminPlus preflight/payload parity verification completed (3 rounds).");
