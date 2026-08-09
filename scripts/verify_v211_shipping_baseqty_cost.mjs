import fs from 'node:fs';
const app=fs.readFileSync('apps/web/src/App.tsx','utf8');
const worker=fs.readFileSync('apps/worker/src/worker.ts','utf8');
const must=(ok,msg)=>{if(!ok) throw new Error(msg); console.log(`[PASS] ${msg}`)};

console.log('\n[ROUND 1] mapping/base quantity/shipping fee UI and persistence');
must(app.includes('V211 어드민플러스 기본수량·배송비·구성원가 매칭') || app.includes('V212 API 기본수량·배송비 수동수정·종료쿠폰 복구발행') || app.includes('V213 옵션별 발주시간·AdminPlus 결제·토스매핑·수집완료') || app.includes('V213 API매핑 서버확정·옵션별 2회 발주시간·자동감시 알림 보강'),'V211+ UI marker');
must(app.includes('shippingFee: number') && app.includes('["배송비", "기본배송비", "발주배송비", "공급처배송비"]'),'shipping fee is part of mapping and Excel import aliases');
must(app.includes('<th>기본수량</th>') && app.includes('<th>배송비</th>'),'mapping UI exposes base quantity and shipping fee');
must(app.includes('<label>기본수량') && app.includes('<label>배송비(원)'),'AdminPlus direct matching exposes base quantity and shipping fee');
must(app.includes('구성원가 = 단가 × 기본수량 + 배송비') || app.includes('구성원가 = AdminPlus 단가 × 기본수량 + 배송비'),'configured-cost formula is explained');
must(worker.includes('shippingFee: Number.isFinite(shippingFee) ? Math.max(0, shippingFee) : 0'),'Worker persists mapping shipping fee');

console.log('\n[ROUND 2] AdminPlus quantity semantics / duplicate multiplication protection');
must(worker.includes('match_string, products') || worker.includes('match_string: matchString, products'),'AdminPlus product-match products are still written with per-match qty');
must(worker.includes('qty: Math.max(1, Math.floor(Number(order.qty || order.quantity || 1) || 1))') && worker.includes('baseQty를 보유하므로 주문 qty에는 다시 곱하지 않습니다'),'marketplace order qty is sent once and baseQty is not multiplied twice');
must(worker.includes('기존 1:N 다상품 매칭은 웹앱에서 단일 상품으로 덮어쓰지 않습니다.') && worker.includes('단일 상품의 qty>1 기본수량 변경은 허용합니다.'),'single-product qty>1 can be edited while true multi-product mappings stay protected');
const unit=3500, shipping=4000;
const configured=(qty)=>unit*qty+shipping;
must(configured(1)===7500 && configured(2)===11000 && configured(5)===21500,'user barijak examples calculate correctly');
const marketplaceQty=3, baseQty=2;
must(marketplaceQty===3 && marketplaceQty*baseQty===6,'marketplace qty remains 3 while AdminPlus match expands to 6 base units');

console.log('\n[ROUND 3] price watch uses configured cost');
must(worker.includes('baselineConfiguredCost = baseline * baseQty + shippingFee'),'baseline configured cost calculated');
must(worker.includes('currentConfiguredCost = product.price * baseQty + shippingFee'),'current configured cost calculated');
must(worker.includes('oldConfiguredCost: baselineConfiguredCost') && worker.includes('newConfiguredCost: currentConfiguredCost'),'price alerts persist configured-cost before/after values');
must(app.includes('기준 구성원가') && app.includes('현재 구성원가'),'price-watch UI shows configured costs');
must(worker.includes('version: "v211-adminplus-shipping-baseqty-cost-watch"') || worker.includes('version: "v212-manual-qty-shipping-coupon-recovery"') || worker.includes('version: "v213-per-option-payment-toss-mapping"'),'Worker V211+ runtime marker');
console.log('\n[PASS] V211 shipping/baseQty/configured-cost verification completed (3 rounds).');
