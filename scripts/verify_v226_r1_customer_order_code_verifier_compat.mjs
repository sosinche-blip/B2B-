import fs from "node:fs";
const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");
const verifier = fs.readFileSync("scripts/verify_v208_adminplus_automation.mjs", "utf8");
const must=(ok,msg)=>{if(!ok) throw new Error(msg); console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] deterministic customer order code");
must(worker.includes('function adminplusCustomerOrderCode(row: Record<string, unknown>)'), "deterministic customer-order-code helper exists");
must(worker.includes('const raw = `${prefix}-${String(row.orderNo || "")}-${String(row.optionId || "")}`'), "customer order code is derived from channel/order/option");
must(worker.includes('return `B2B-${raw}`.slice(0, 120)'), "customer order code has stable B2B prefix and length cap");

console.log("[ROUND 2] payload wiring");
must(worker.includes('const customerOrderCode = adminplusCustomerOrderCode({ ...row.order, channel: row.order.channel, optionId: row.mapping.optionId })'), "shared payload builder calls deterministic helper");
must(worker.includes('customer_order_code: customerOrderCode'), "payload writes deterministic code");

console.log("[ROUND 3] legacy verifier compatibility");
must(!verifier.includes("customer_order_code: adminplusCustomerOrderCode"), "obsolete direct-call literal assertion removed");
must(verifier.includes("customer_order_code: customerOrderCode"), "V208 verifier follows V226 payload builder");

console.log("[PASS] V226 R1 customer-order-code verifier compatibility completed (3 rounds).");
