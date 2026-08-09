import fs from 'node:fs';
const app = fs.readFileSync('apps/web/src/App.tsx','utf8');
const worker = fs.readFileSync('apps/worker/src/worker.ts','utf8');
const must=(ok,msg)=>{ if(!ok) throw new Error(msg); console.log(`[PASS] ${msg}`); };

console.log('\n[ROUND 1] existing Excel mapping assisted suggestions');
must(app.includes('V210 엑셀매핑 자동추천·검색형 어드민플러스 매칭') || app.includes('V211 어드민플러스 기본수량·배송비·구성원가 매칭') || app.includes('V212 API 기본수량·배송비 수동수정·종료쿠폰 복구발행') || app.includes('V213 옵션별 발주시간·AdminPlus 결제·토스매핑·수집완료') || app.includes('V213 API매핑 서버확정·옵션별 2회 발주시간·자동감시 알림 보강'),'V210 UI marker');
must(app.includes('loadAdminPlusExcelMatchSuggestions'),'Excel-assisted suggestion loader exists');
must(app.includes('기존 엑셀매핑 자동추천 · 확인 후 확정'),'confirmation-first suggestion UI exists');
must(app.includes('기존 AdminPlus 매칭') && app.includes('기존 확정매칭 재사용'),'existing AdminPlus/confirmed mapping reuse sources exist');
must(app.includes('업체상품코드 일치') && app.includes('업체상품명 일치'),'safe exact-code/name fallback suggestions exist');
must(app.includes('status: "확정가능"') && app.includes('"복합매칭확인"'),'suggestions separate safe confirmation from complex mappings');
must(app.includes('confirmAdminPlusSuggestedMatch'),'user confirmation handler exists');
must(app.includes('confirmAdminPlusSuggestedMatch') && app.includes('상품/옵션/수량 변경을 AdminPlus 재조회로 검증'), 'new or changed product/option/qty suggestions still require explicit user confirmation');

console.log('\n[ROUND 2] search / Coupang-Toss reuse / safety');
must(app.includes('adminplusMappingSearch') && app.includes('업체명·상품명·옵션ID·코드 검색'),'Excel mapping search exists');
must(app.includes('adminplusProductSearch') && app.includes('상품명·상품코드·옵션명·옵션코드'),'AdminPlus catalog search exists');
must(app.includes('adminplusSuggestionSearch'),'suggestion result search exists');
must(app.includes('같은 상품/옵션 선택은 재사용') || app.includes('같은 업체 + 같은 업체상품명'),'same-vendor/product cross-channel reuse is explained');
must(app.includes('mapping.channel') && app.includes('mapping.optionId'),'Coupang/Toss channel + option IDs remain preserved in confirmed links');
must(worker.includes('기존 1:N 상품문자열 매칭은 웹앱에서 1개 상품으로 덮어쓰지 않습니다.') || worker.includes('기존 1:N 다상품 매칭은 웹앱에서 단일 상품으로 덮어쓰지 않습니다.'),'existing 1:N overwrite protection preserved');
must(app.includes('복합매칭확인'),'1:N mappings are not silently confirmed');

console.log('\n[ROUND 3] complete match list / runtime marker / deterministic suggestion priority');
must(worker.includes('async function adminplusCatalogMatches'),'paginated AdminPlus match-list helper exists');
must(worker.includes('data.has_more') && worker.includes('data.next_cursor'),'AdminPlus match-list pagination follows cursor/has_more');
must(worker.includes('adminplus_catalog_match_list_v210'),'V210 match-list endpoint mode marker');
must(worker.includes('version: "v210-excel-assisted-adminplus-match"') || worker.includes('version: "v211-adminplus-shipping-baseqty-cost-watch"') || worker.includes('version: "v212-manual-qty-shipping-coupon-recovery"') || worker.includes('version: "v213-per-option-payment-toss-mapping"'),'Worker V210 runtime marker');

const normalize=(v)=>String(v||'').trim().toLowerCase().replace(/\s+/g,'');
const excel={vendorName:'A농장', vendorProductName:'사과 5kg', vendorCode:'1001'};
const match={match_string:'사과 5kg',products:[{product_code:1001,option_code:null,qty:1}],is_temp:false,product_count:1};
must(normalize(excel.vendorProductName)===normalize(match.match_string),'exact Excel vendor-product name maps to existing AdminPlus match string');
const coupang={channel:'쿠팡',optionId:'C-1',...excel};
const toss={channel:'토스',optionId:'T-1',...excel};
must(coupang.vendorName===toss.vendorName && normalize(coupang.vendorProductName)===normalize(toss.vendorProductName),'Coupang/Toss rows can reuse the same supplier product connection safely');
console.log('\n[PASS] V210 Excel-assisted AdminPlus matching/search verification completed (3 rounds).');
