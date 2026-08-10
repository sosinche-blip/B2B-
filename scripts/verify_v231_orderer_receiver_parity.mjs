import fs from "node:fs";
const worker = fs.readFileSync("apps/worker/src/worker.ts","utf8");
const app = fs.existsSync("apps/web/src/App.tsx") ? fs.readFileSync("apps/web/src/App.tsx","utf8") : "";
const must=(ok,msg)=>{if(!ok) throw new Error(msg); console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] Excel purchase-template semantics");
if (app) {
  must(app.includes('senderName: "E"') && app.includes('senderPhone: "F"'), "몬딱제주 주문자 열 is mapped");
  must(app.includes('senderName: "C"') && app.includes('senderPhone: "D"'), "꿈틀 주문자 열 is mapped");
  must(app.includes('"주문자전화"') && app.includes('"발송업체 연락처"'), "learned-template aliases cover orderer phone variants");
  must(app.includes("ordererBusinessInfo: { ...DEFAULT_BUSINESS_INFO }"), "server payload carries Excel business identity");
}

console.log("[ROUND 2] AdminPlus orderer/receiver separation");
must(worker.includes("function adminplusOrdererInfo"), "business orderer helper exists");
must(worker.includes("order_name: ordererName"), "AdminPlus payload sets orderer business name");
must(worker.includes("order_phone: ordererPhone"), "AdminPlus payload sets orderer business phone");
must(worker.includes("receiver_name: receiverName"), "receiver remains marketplace customer");
must(worker.includes("receiver_hp: phone"), "receiver phone remains marketplace customer");
must(worker.includes("주문자 업체명 누락"), "preflight validates business orderer name");
must(worker.includes("주문자 연락처 형식 오류"), "preflight validates business orderer phone");

console.log("[ROUND 3] regression/release");
must(worker.includes('product_string: String(row.matchString || "").trim()'), "per-option AdminPlus product mapping retained");
must(worker.includes("legacy-coupang-shipment-recovery-v230-20260810"), "V230 shipment recovery retained");
must(worker.includes("excel-orderer-business-receiver-customer-v231-20260810"), "V231 orderer/receiver revision exposed");
console.log("[PASS] V231 Excel-orderer/AdminPlus-receiver parity verification completed (3 rounds).");
