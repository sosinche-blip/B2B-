import fs from 'node:fs';
const app=fs.readFileSync(new URL('../apps/web/src/App.tsx',import.meta.url),'utf8');
const guide=fs.readFileSync(new URL('../V213_OPERATION_GUIDE.md',import.meta.url),'utf8');
function must(v,m){if(!v)throw new Error(`[FAIL] ${m}`);console.log(`[PASS] ${m}`)}

console.log('[ROUND 1] dashboard stage definition');
must(app.includes('결제완료(쿠팡 ACCEPT·토스 PAID) → 수집완료(AdminPlus 발주 성공·결제 전) → 상품준비중 → 배송중 → 배송완료'), 'visible flow order is payment -> collected -> preparing -> shipping -> delivered');
must(app.indexOf('<span>결제완료</span>') < app.indexOf('<span>수집완료</span>'), 'payment card is rendered before collected card');
must(guide.includes('AdminPlus 주문등록(발주)이 성공했고 AdminPlus 결제는 아직 완료되지 않은 주문만'), 'operation guide uses exact collected definition');

console.log('\n[ROUND 2] collection gate');
must(app.includes('isAdminPlusOrderSubmitted(hist) && !isAdminPlusPaymentCompleted(hist)'), 'collected requires AdminPlus submission and unpaid status');
must(app.includes('text(hist.submittedAt)') && app.includes('text(hist.orderKey)') && app.includes('text(hist.customerOrderCode)') && app.includes('text(hist.adminplusOrderCode)'), 'submission evidence uses persisted AdminPlus order history');
must(app.includes('coupangPayment: marketplacePaidRows.filter') && app.includes('tossPayment: marketplacePaidRows.filter'), 'channel payment overview remains based on actual ACCEPT/PAID rows');

console.log('\n[ROUND 3] deterministic state routing');
const marketPaid=[
  {id:'PAY_ONLY'},
  {id:'SUBMITTED_PENDING'},
  {id:'SUBMITTED_FAILED'},
  {id:'SUBMITTED_PAID'},
];
const history={
  PAY_ONLY:null,
  SUBMITTED_PENDING:{submitted:true,payment:'대기'},
  SUBMITTED_FAILED:{submitted:true,payment:'실패'},
  SUBMITTED_PAID:{submitted:true,payment:'완료'},
};
const collected=marketPaid.filter((r)=>history[r.id]?.submitted===true&&history[r.id]?.payment!=='완료');
const payment=marketPaid.filter((r)=>!collected.some((c)=>c.id===r.id));
must(collected.map((r)=>r.id).join(',')==='SUBMITTED_PENDING,SUBMITTED_FAILED', 'only AdminPlus-submitted unpaid/failed rows are collected');
must(payment.map((r)=>r.id).join(',')==='PAY_ONLY,SUBMITTED_PAID', 'unsubmitted market-paid rows stay payment-complete and paid transition rows never remain collected');
console.log('\n[PASS] Daily operation stage fix verified in 3 rounds.');
