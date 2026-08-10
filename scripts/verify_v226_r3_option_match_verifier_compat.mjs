import fs from "node:fs";
const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");
const verifier = fs.readFileSync("scripts/verify_v217_option_baseqty_confirm_fix.mjs", "utf8");
const must=(ok,msg)=>{if(!ok) throw new Error(msg); console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] confirmed per-option match flow");
must(worker.includes('const matchString = String(confirmedLink?.matchString || "").trim()'), "confirmed-link matchString is loaded");
must(worker.includes('candidates.push({ account, order, mapping, matchString'), "matchString is carried into purchase candidate");
must(worker.includes('product_string: String(row.matchString || "").trim()'), "shared payload builder uses candidate matchString");

console.log("[ROUND 2] option/baseQty isolation");
const qtyExpr = worker.match(/const qty = Math\.max\(1, Math\.floor\(Number\(row\.order\.qty \|\| row\.order\.quantity \|\| 1\) \|\| 1\)\);/);
must(Boolean(qtyExpr) && !String(qtyExpr?.[0]||"").includes("baseQty"), "marketplace qty remains independent of baseQty");

console.log("[ROUND 3] legacy verifier compatibility");
must(verifier.includes('product_string: String(row.matchString || "").trim()'), "V217 verifier follows V226 shared payload builder");
must(!verifier.includes("items: [{ product_string: matchString"), "obsolete direct product_string literal is absent");
console.log("[PASS] V226 R3 option-match verifier compatibility completed (3 rounds).");
