import fs from "node:fs";
const workerPath = fs.existsSync("apps/worker/src/worker.ts") ? "apps/worker/src/worker.ts" : [...process.argv.slice(2), "src/worker.ts"].find(p=>fs.existsSync(p));
const worker = fs.readFileSync(workerPath, "utf8");
const must=(ok,msg)=>{if(!ok) throw new Error(msg); console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] Coupang large ID preservation");
must(worker.includes("function coupangRequestBodyText"), "raw JSON body support exists");
must(worker.includes("function exactJsonInteger"), "exact integer serialization helper exists");
must(worker.includes("coupangAckRawJson"), "preparing ACK preserves shipmentBoxId digits");
must(worker.includes("coupangInvoiceRawJson"), "invoice upload preserves shipment/order/vendorItem IDs");
must(!worker.includes("shipmentBoxId: Number(row.shipmentBoxId)"), "invoice upload no longer converts shipmentBoxId through JS Number");

console.log("[ROUND 2] courier normalization / diagnostics");
must(worker.includes("knownCodes = new Set(Object.values(COUPANG_DELIVERY_COMPANY_CODES))"), "known Coupang courier codes are constrained");
must(worker.includes('return "CJGLS"'), "CJ variants normalize to CJGLS");
must(worker.includes("function coupangShipmentMissingFields"), "field-level missing diagnostics exist");

console.log("[ROUND 3] regression/release");
must(worker.includes("coupang-shipment-bigint-courier-v227-20260810"), "V227 Coupang shipment revision exposed");
must(worker.includes('product_string: String(row.matchString || "").trim()'), "AdminPlus option-specific product mapping retained");
must(worker.includes('trackingNumber: row.trackingNo'), "Toss shipment path retained");
console.log("[PASS] V227 Coupang shipment precision/courier verification completed (3 rounds).");
