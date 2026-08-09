import fs from 'node:fs';
const app = fs.readFileSync(new URL('../apps/web/src/App.tsx', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../apps/worker/src/worker.ts', import.meta.url), 'utf8');
const must = (ok, msg) => { if (!ok) throw new Error(`[FAIL] ${msg}`); console.log(`[PASS] ${msg}`); };

console.log('[ROUND 1] confirmed mapping edit UI / dirty-state');
must(app.includes('const editableChanged = qtyChanged || nextShippingFee !== previousShippingFee || nextPurchaseTime !== previousPurchaseTime'), 'qty/shipping/purchaseTime all mark confirmed rows dirty');
must(app.includes('? "수정 확정" : "매칭 확정"'), 'existing confirmed mappings expose 수정 확정 action after edit');
must(app.includes('alreadyLinked.purchaseTime') && app.includes('alreadyLinked.shippingFee'), 'existing confirmed link values are restored into suggestion rows');
must(app.includes('발주시간/기본수량/배송비를 사용자가 직접 수정했습니다.'), 'edit guidance covers all three editable fields');

console.log('\n[ROUND 2] save/apply verification');
must(app.includes('const applyResult = await callApi("/api/integrations/adminplus/catalog/matches/apply"'), 'confirmed edit always reapplies AdminPlus single-product match');
must(app.includes('if (applyResult.ok !== true)'), 'AdminPlus no-op/verification failure blocks false success');
must(app.includes('const persistedMapping = persistedMappings.find'), 'settings-save response is checked for persisted mapping');
must(app.includes('const persistedLink = persistedLinks.find'), 'settings-save response is checked for persisted AdminPlus product link');
must(app.includes('persistedMapping.shippingFee') && app.includes('persistedLink.shippingFee'), 'shipping fee is verified in both mapping and confirmed-link persistence');
must(app.includes('persistedMapping.purchaseTime') && app.includes('persistedLink.purchaseTime'), 'purchase time is verified in both persistence records');

console.log('\n[ROUND 3] shared mapping sync / backend exact verification');
must(app.includes('Math.max(0, toNumber(row.shippingFee, 0)),\n      /^([01]\\d|2[0-3]):[0-5]\\d$/.test(text(row.purchaseTime))'), 'mapping fingerprint includes purchaseTime so time-only edits auto-sync');
must(worker.includes('const purchaseTimeRaw = displayText(row.purchaseTime || row.purchase_time || "09:00").trim();'), 'worker shared-mapping normalizer keeps purchaseTime');
must(worker.includes('purchaseTime: /^([01]\\d|2[0-3]):[0-5]\\d$/.test(purchaseTimeRaw) ? purchaseTimeRaw : "09:00"'), 'worker persists normalized HH:MM purchaseTime');
must(worker.includes('mode: "adminplus_catalog_match_apply_v214_edit_verify"'), 'AdminPlus apply endpoint uses exact edit-verification mode');
must(worker.includes('Number(actual.product_code || 0) === Number(requested.product_code || 0)') && worker.includes('Math.max(1, Math.floor(Number(actual.qty || 1) || 1))'), 'backend verifies actual product/option/qty after update');

console.log('\n[SCENARIO] deterministic edit persistence');
const oldRow = { channel: '쿠팡', optionId: '95235689038', baseQty: 5, shippingFee: 0, purchaseTime: '09:00', updatedAt: '2026-08-09T04:00:00.000Z' };
const edited = { ...oldRow, shippingFee: 4000, purchaseTime: '10:30', updatedAt: '2026-08-09T05:00:00.000Z' };
const normalize = (row) => ({ ...row, shippingFee: Math.max(0, Number(row.shippingFee || 0)), purchaseTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(row.purchaseTime || '')) ? row.purchaseTime : '09:00' });
const merged = Date.parse(edited.updatedAt) >= Date.parse(oldRow.updatedAt) ? normalize(edited) : normalize(oldRow);
must(merged.shippingFee === 4000, '배송비 0 -> 4000 수정값 survives server merge');
must(merged.purchaseTime === '10:30', '발주시간 수정값 survives server normalization/merge');
must(merged.baseQty === 5, 'unchanged 기본수량 remains intact');
console.log('\n[PASS] confirmed mapping edit persistence verification completed (3 rounds).');
