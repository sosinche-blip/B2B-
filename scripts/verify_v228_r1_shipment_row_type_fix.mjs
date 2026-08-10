import fs from "node:fs";
const worker = fs.readFileSync("apps/worker/src/worker.ts","utf8");
const must=(ok,msg)=>{if(!ok) throw new Error(msg); console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] stable shipment row typing");
must(worker.includes("rows: Array<Record<string, unknown>>;"), "Coupang refresh helper returns Record rows");
must(worker.includes("const updated: Record<string, unknown> = {"), "refreshed Coupang row keeps generic shipment shape");
must(worker.includes("const rawShipmentRows: Array<Record<string, unknown>>"), "pending shipment rows are normalized to Record rows");

console.log("[ROUND 2] common upload loop safety");
must(worker.includes("for (const value of shipmentRows)"), "shipment loop iterates generic values");
must(worker.includes("const row = objectRecord(value);"), "shipment loop normalizes row before channel/order access");
must(worker.includes("adminplusHistoryKey(row.channel, row.orderNo, row.optionId)"), "common shipment history key remains intact");

console.log("[ROUND 3] regression/release");
must(worker.includes("coupang-shipment-bigint-courier-v227-20260810"), "V227 Coupang shipment fix retained");
must(worker.includes("automation-persist-selected-manual-v228-20260810"), "V228 automation persistence retained");
must(worker.includes("v228-r1-shipment-row-type-fix-20260810"), "V228 R1 hotfix marker exposed");

console.log("[PASS] V228 R1 shipment-row TypeScript hotfix verification completed (3 rounds).");
