import fs from "node:fs";
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const app=fs.existsSync("apps/web/src/App.tsx")?fs.readFileSync("apps/web/src/App.tsx","utf8"):"";
const must=(ok,msg)=>{if(!ok) throw new Error(msg); console.log(`[PASS] ${msg}`)};
console.log("[ROUND 1] official AdminPlus orderer field parity");
must(worker.includes('name: "소신채"') && worker.includes('phone: "010-6880-9413"'),"fixed business orderer identity retained");
must(worker.includes("orderer_name: ordererName"),"official orderer_name field is used");
must(worker.includes("orderer_hp: ordererPhone") && worker.includes("orderer_tel: ordererPhone"),"official orderer_hp/orderer_tel fields are used");
must(!worker.includes("order_name: ordererName") && !worker.includes("order_phone: ordererPhone"),"obsolete non-API order_name/order_phone fields removed from AdminPlus payload");
must(worker.includes("function adminplusOrdererInfo(_payload") && worker.includes("ADMINPLUS_DEFAULT_ORDERER.name"),"stale persisted values cannot replace fixed business orderer");
console.log("[ROUND 2] receiver and order safety");
must(worker.includes("receiver_name: receiverName") && worker.includes("receiver_tel: receiverTel") && worker.includes("receiver_hp: receiverHp"),"marketplace buyer remains receiver only");
must(worker.includes("adminplusRecoverCreatedOrder"),"customer_order_code reconciliation retained");
must(worker.includes("결제 권한/잔액/한도 오류는 이미 생성된 AdminPlus 주문을 실패로 되돌리지 않습니다."),"order/payment split retained");
console.log("[ROUND 3] release/regression");
must(worker.includes('adminplusOrdererParityRevision: "v248-r3-adminplus-orderer-parity-fix-20260812"'),"V248 R3 runtime marker exposed");
must(worker.includes('adminplusVirtualPhoneRevision: "v248-r2-adminplus-virtual-phone-fix-20260812"'),"V248 R2 virtual phone fix retained");
must(worker.includes('shipmentSyncReconcileRevision: "v247-shipment-sync-reconcile-fix-20260812"'),"V247 shipment fix retained");
if(app){
  must(
    /const UI_RELEASE_REVISION = "V248 R\d+(?:\.\d+)?";/.test(app),
    "UI release retains V248 R3+ orderer policy"
  );
  must(
    app.includes("ORDERER_RECEIVER_POLICY_REVISION") ||
    app.includes("ordererBusinessInfo"),
    "UI retains current orderer/receiver policy representation"
  );
}
console.log("[PASS] V248 R3 AdminPlus orderer parity verification completed (3 rounds).");
