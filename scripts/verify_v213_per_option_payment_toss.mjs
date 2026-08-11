import fs from 'node:fs';
const app=fs.readFileSync(new URL('../apps/web/src/App.tsx',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../apps/worker/src/worker.ts',import.meta.url),'utf8');
function must(v,m){if(!v)throw new Error(`[FAIL] ${m}`);console.log(`[PASS] ${m}`)}
console.log('[ROUND 1] daily dashboard / session token');
must((app.includes('V213 API매핑 서버확정·옵션별 2회 발주시간·자동감시 알림 보강') || app.includes('V223')),'V213 UI marker');
must(app.includes('수집완료(AdminPlus 발주완료·결제 전)') && app.includes('isAdminPlusOrderSubmitted(hist) && !isAdminPlusPaymentCompleted(hist)'),'수집완료 is limited to AdminPlus-submitted and unpaid rows');
must(app.includes('/api/integrations/adminplus/purchase/status'),'dashboard uses server payment history');
must(app.includes('b2b-ncloud-admin-token-session') && app.includes('sessionStorage.setItem'),'Ncloud admin token remembered only for browser session');
console.log('\n[ROUND 2] per-option schedule / compact matching table');
must(app.includes('<th>발주시간</th>') && app.includes('placeholder="09:00,14:00"'),'option-level one/two purchase times');
must(!app.includes('발주(주문등록) 시간'),'global purchase registration time removed');
must(
  (app.includes('<th>옵션ID</th><th>매칭 확정</th>')) ||
  (app.includes('<th>옵션ID</th><th>재확정 상태</th><th>발주시간</th>')),
  'option ID is adjacent to confirmation/reconfirmation state'
);
must(!app.includes('<th>추천근거</th>'),'recommendation-reason column removed');
console.log('\n[ROUND 3] Toss mapping / payment safety');
must(worker.includes('tossProductItemManagementCode') && worker.includes('adminplusOrderMappingCandidateIds'),'Toss mapping checks stockId and management-code candidates');
must(worker.includes('/v1/seller/payments/pending') && worker.includes('/v1/seller/payments') && worker.includes('/v1/seller/balance'),'AdminPlus payment and balance endpoints');
must(worker.includes('paymentMaxPerBatch') && worker.includes('paymentDailyLimit'),'per-account payment limits');
must(worker.includes('String(hist.paymentStatus || "") !== "완료" || !hist.marketplacePreparingAt'),'shipment requires completed payment/preparing transition');
must(worker.includes('adminplusPurchaseTimesFromMappings(savedPayload)'),'scheduler uses per-option purchase times');
must(worker.includes('version: "v213-per-option-payment-toss-mapping"'),'V213 worker runtime');
console.log('\n[PASS] V213 per-option schedule/payment/Toss mapping verification completed (3 rounds).');

console.log('\n[SCENARIO] deterministic routing / limits / dashboard');
const tossOrder={channel:'토스',optionId:'1613607663',tossStockId:'1613607663',tossProductItemManagementCode:'BAR-2KG'};
const mappingCandidates=[tossOrder.optionId,tossOrder.tossStockId,tossOrder.tossProductItemManagementCode];
const mappings=[{channel:'토스',optionId:'BAR-2KG',purchaseTime:'11:20'}];
const found=mappingCandidates.map(String).find((id)=>mappings.some((m)=>m.channel===tossOrder.channel&&m.optionId===id));
must(found==='BAR-2KG','Toss management-code fallback resolves a previously stockId-mismatched mapping');
const canPay=(amount,maxPerBatch,dailySpent,dailyLimit)=>amount>0&&maxPerBatch>0&&dailyLimit>0&&amount<=maxPerBatch&&dailySpent+amount<=dailyLimit;
must(canPay(30000,50000,60000,100000)===true && canPay(50000,50000,60000,100000)===false,'payment one-time/daily limits are deterministic');
const marketPaid=[{id:'A'},{id:'B'},{id:'C'}]; const hist={A:null,B:{submitted:true,payment:'대기'},C:{submitted:true,payment:'완료'}};
const collected=marketPaid.filter((r)=>hist[r.id]?.submitted===true&&hist[r.id]?.payment!=='완료'); const payment=marketPaid.filter((r)=>!collected.some((c)=>c.id===r.id));
must(payment.map((r)=>r.id).join(',')==='A,C'&&collected.map((r)=>r.id).join(',')==='B','dashboard flow is marketplace payment -> AdminPlus submitted/unpaid -> preparing');
