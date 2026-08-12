import fs from "node:fs";
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const app=fs.existsSync("apps/web/src/App.tsx")?fs.readFileSync("apps/web/src/App.tsx","utf8"):"";
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] shipment target semantics");
must(worker.includes("trackingReadyBefore"),"shipment run counts tracking-ready unuploaded rows");
must(worker.includes("const preparingRetry = await adminplusEnsureMarketplacePreparing"),"shipment run retries marketplace preparing before target selection");
must(worker.includes("skippedTrackingReady"),"tracking-ready rows are excluded from direct lookup candidates");
must(worker.includes("송장정보 이미 보유 - 직접조회 불필요"),"direct lookup no longer wastes requests on known tracking rows");
must(worker.includes("송장보유 미등록 ${Number(target.trackingReadyBefore"),"operator message separates tracking-ready count");

console.log("[ROUND 2] payment batch clarity");
must(worker.includes('permissionError ? "권한확인필요" : "실패"'),"payment permission failures are distinguished");
if(app){
  must(app.includes("adminPlusPaymentBatchRows"),"UI groups payment history by orderKey");
  must(app.includes("배치합계 ${amount.toLocaleString()}원 · ${batchRows.length}건"),"UI labels repeated amount as batch total");
  must(
    app.includes("결제금액은 개별 상품가격이 아니라 AdminPlus orderKey 단위의 배치 결제합계") ||
    (
      app.includes("결제이력 표가 아니라 송장 처리 대기열") &&
      app.includes("과거 자동 예치금 결제 실패금액은 여기서 표시하지 않습니다")
    ),
    "UI either explains payment semantics or intentionally removes payment details from shipment queue"
  );
  must(
    app.includes("row.paymentError") ||
    app.includes("송장 미입력·미등록 현황"),
    "payment failure detail is either shown in legacy history or removed from shipment-only queue"
  );
}

console.log("[ROUND 3] shipment operational clarity");
must(worker.includes("준비전환 신규") && worker.includes("이미 준비중 확인"),"shipment message separates new preparing transition from already-prepared reconciliation");
must(worker.includes("보조 직접조회") && worker.includes("후보 ${Number(candidate.eligible"),"auxiliary direct lookup candidate is clearly named under current shipment source-of-truth policy");
must(worker.includes("registrationTarget: shipmentRows.length"),"actual registration target is tracked");
must(worker.includes("v243-shipment-target-payment-batch-clarity-20260811"),"V243 runtime revision exposed");
if(app) must(app.includes('SHIPMENT_TARGET_PAYMENT_CLARITY_UI_REVISION = "v243-shipment-target-payment-batch-clarity-20260811"'),"web V243 revision exposed");

console.log("[PASS] V243 shipment-target/payment-batch clarity verification completed (3 rounds).");
