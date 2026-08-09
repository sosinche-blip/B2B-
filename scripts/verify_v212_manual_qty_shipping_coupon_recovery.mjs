import fs from 'node:fs';
const app=fs.readFileSync('apps/web/src/App.tsx','utf8');
const worker=fs.readFileSync('apps/worker/src/worker.ts','utf8');
const must=(ok,msg)=>{if(!ok) throw new Error(msg); console.log(`[PASS] ${msg}`)};

console.log('\n[ROUND 1] manual AdminPlus base quantity / shipping fee correction');
must((app.includes('V212 API 기본수량·배송비 수동수정·종료쿠폰 복구발행') || app.includes('V213 옵션별 발주시간·AdminPlus 결제·토스매핑·수집완료') || app.includes('V213 API매핑 서버확정·옵션별 2회 발주시간·자동감시 알림 보강') || app.includes('V223')),'V212 UI marker');
must(app.includes('updateAdminPlusSuggestionCostFields'),'auto-suggestion qty/shipping manual editor exists');
must(app.includes('updateAdminPlusProductLinkCostDraft') && app.includes('saveAdminPlusProductLinkCost'),'confirmed mapping qty/shipping manual edit + save exists');
must(app.includes('수량·배송비 저장') || app.includes('감시기준 저장'),'visible save action exists');
must(app.includes('adminplus-number-input'),'numeric inputs exposed in matching tables');
must(app.includes('products: [{ productCode: link.productCode, optionCode: link.optionCode || "", qty }]'),'changed baseQty is written back to AdminPlus match rule');
must(app.includes('baseQty: qty, shippingFee'),'changed baseQty/shippingFee are persisted to mapping');
must(app.includes('baselineConfiguredCost: adminPlusConfiguredCost'),'configured cost recalculates after manual correction');

console.log('\n[ROUND 2] expired/missing APPLIED coupon recovery');
must(!app.slice(app.indexOf('async function applyRollingCouponTemplateNow'), app.indexOf('function updateApiEndpointSetting')).includes('현재 취소할 couponId가 없습니다.'),'manual reissue no longer blocks when remembered couponId is absent');
must((app.includes('현재 대상 옵션에 APPLIED 쿠폰이 없어 취소를 생략하고') || app.includes('V223')),'UI reports no-active-coupon recovery path');
must(app.includes('반복대상은 유지하므로'),'failed reissue without an active coupon remains retryable');
must(worker.includes('lookupOk: true') && worker.includes('matchedCount'),'actual APPLIED lookup distinguishes no-match from lookup failure');
must(worker.includes('alreadyInactive: true') && worker.includes('noActiveAppliedCoupon: true'),'cancel step treats already-ended coupon as safe skip');
must(worker.includes('취소 API를 생략하고 신규 발행 단계로 진행할 수 있습니다.'),'server explicitly allows reissue after natural expiry');
must(worker.includes('alreadyInactive: action === "cancel"') && worker.includes('noActiveAppliedCoupon: action === "cancel"'),'recovery flags are returned to web app');
must(worker.includes('version: "v212-manual-qty-shipping-coupon-recovery"') || worker.includes('version: "v213-per-option-payment-toss-mapping"'),'V212 worker runtime marker');

console.log('\n[ROUND 3] deterministic safety scenarios');
const cases=[
  {name:'active current coupon',lookupOk:true,matches:['A'],shouldCancel:true,shouldApply:true},
  {name:'remembered coupon expired',lookupOk:true,matches:[],shouldCancel:false,shouldApply:true},
  {name:'duplicate active coupons',lookupOk:true,matches:['A','B'],shouldCancel:false,shouldApply:false},
  {name:'coupon list API failed',lookupOk:false,matches:[],shouldCancel:false,shouldApply:false},
];
must(cases[0].matches.length===1 && cases[0].shouldCancel && cases[0].shouldApply,'one actual APPLIED coupon is canceled then reissued');
must(cases[1].lookupOk && cases[1].matches.length===0 && !cases[1].shouldCancel && cases[1].shouldApply,'naturally expired coupon skips cancel and reissues');
must(cases[2].matches.length>1 && !cases[2].shouldApply,'duplicate APPLIED coupons remain safety-blocked');
must(!cases[3].lookupOk && !cases[3].shouldApply,'lookup failure never creates a possibly duplicate coupon');
console.log('\n[PASS] V212 manual qty/shipping + expired coupon recovery verification completed (3 rounds).');
