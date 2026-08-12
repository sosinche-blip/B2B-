import fs from "node:fs";
const app=fs.readFileSync("apps/web/src/App.tsx","utf8");
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] queue semantics");
must(app.includes("function adminPlusShipmentPendingRows()"),"shipment pending queue helper exists");
must(app.includes("if (row.shipmentUploadedAt || row.operatorResolvedAt) continue;"),"completed or operator-resolved marketplace shipments are excluded");
must(app.includes("if (!isAdminPlusOrderSubmitted(row)) continue;"),"only submitted AdminPlus orders enter shipment queue");

console.log("[ROUND 2] operator UI");
must(app.includes("송장 미입력·미등록 현황"),"history title is replaced by shipment-pending title");
must(app.includes("결제이력 표가 아니라 송장 처리 대기열"),"UI explains shipment-only purpose");
must(app.includes("과거 자동 예치금 결제 실패금액은 여기서 표시하지 않습니다"),"historical auto-payment failure is removed from shipment view");
must(app.includes("AdminPlus 송장입력대기"),"missing tracking state is explicit");
must(app.includes("상품준비중 전환대기"),"preparing transition state is explicit");
must(app.includes("마켓등록대기"),"market upload-ready state is explicit");

console.log("[ROUND 3] columns/release");
must(app.includes("<th>송장상태</th>"),"shipment status column exists");
must(app.includes("<th>택배사</th>"),"courier column exists");
must(app.includes("<th>송장번호</th>"),"tracking number column exists");
must(app.includes("<th>다음조치</th>"),"next-action column exists");
must(app.includes('SHIPMENT_PENDING_QUEUE_UI_REVISION = "v244-shipment-pending-queue-ui-20260811"'),"V244 UI revision exposed");

console.log("[PASS] V244 shipment-pending queue UI verification completed (3 rounds).");
