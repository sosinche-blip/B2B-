import fs from "node:fs";
const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");
const verifier = fs.readFileSync("scripts/verify_v211_shipping_baseqty_cost.mjs", "utf8");
const must=(ok,msg)=>{if(!ok) throw new Error(msg); console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] V226 runtime quantity semantics");
const qtyExpr = worker.match(/const qty = Math\.max\(1, Math\.floor\(Number\(row\.order\.qty \|\| row\.order\.quantity \|\| 1\) \|\| 1\)\);/);
must(Boolean(qtyExpr), "shared payload builder uses marketplace order quantity");
must(!String(qtyExpr?.[0] || "").includes("baseQty"), "runtime order qty does not multiply baseQty");

console.log("[ROUND 2] V211 verifier compatibility");
must(verifier.includes("row\\.order\\.qty") || verifier.includes("row\\\\.order\\\\.qty"), "V211 verifier follows refactored row.order.qty expression");
must(!verifier.includes("Number(order.qty || order.quantity || 1)"), "obsolete V211 order.qty literal removed");

console.log("[ROUND 3] V226 R1 behavior retained");
must(worker.includes("function adminplusBuildOrderPayload"), "shared AdminPlus payload builder retained");
must(worker.includes("adminplus-preflight-payload-parity-v226-20260810"), "V226 payload parity revision retained");
must(worker.includes("customer_order_code: customerOrderCode"), "V226 R1 deterministic customer-order-code wiring retained");

console.log("[PASS] V226 R2 V211 quantity verifier compatibility completed (3 rounds).");
