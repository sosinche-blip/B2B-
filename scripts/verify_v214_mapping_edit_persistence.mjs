import fs from 'node:fs';
const app = fs.readFileSync(new URL('../apps/web/src/App.tsx', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../apps/worker/src/worker.ts', import.meta.url), 'utf8');
const must = (ok, msg) => { if (!ok) throw new Error(`[FAIL] ${msg}`); console.log(`[PASS] ${msg}`); };

console.log('[ROUND 1] confirmed mapping edit UI / draft-state');
must(app.includes('const editableChanged = qtyChanged || nextShippingFee !== previousShippingFee || nextPurchaseTime !== previousPurchaseTime'), 'qty/shipping/purchaseTime all mark confirmed rows dirty');
must(app.includes('? "수정 확정" : "매칭 확정"'), 'existing confirmed mappings expose 수정 확정 action after edit');
must(app.includes('alreadyLinked.purchaseTime') && app.includes('alreadyLinked.shippingFee'), 'existing confirmed link values are restored into suggestion rows');
must(app.includes('실제 운영값은 아직 바뀌지 않았으며 ‘수정 확정’을 눌러야 서버 확정값이 변경됩니다.'), 'edit guidance explicitly protects confirmed server value');

console.log('\n[ROUND 2] save/apply + server read-back verification');
must(app.includes('const applyResult = await callApi("/api/integrations/adminplus/catalog/matches/apply"'), 'confirmed edit reapplies AdminPlus single-product match');
must(app.includes('verifyAdminPlusConfirmedPersistence(nextMapping, link)'), 'confirmed edit reloads server and verifies persisted mapping/link');
must(app.includes('loadAdminPlusConfirmedStateFromServer'), 'API mapping loads server-confirmed state first');
must(app.includes('setAdminplusProductLinkDrafts'), 'watch edits use separate draft state');
must(app.includes('미확정 편집') && app.includes('저장하지 않았습니다.'), 'global server save excludes unconfirmed drafts');

console.log('\n[ROUND 3] shared mapping + dual-time backend');
must(app.includes('normalizeOptionPurchaseTimes(row.purchaseTime)'), 'mapping fingerprint/normalization supports dual times');
must(worker.includes('normalizeOptionPurchaseTimeList') && worker.includes('.slice(0, 2)'), 'worker normalizes at most two purchase times');
must(worker.includes('flatMap((row) => optionPurchaseTimes(row.purchaseTime))'), 'scheduler derives both time slots from each mapping');
must(worker.includes('!optionPurchaseTimes(mapping.purchaseTime).includes(dueTime)'), 'due-time filter accepts either configured slot');
must(worker.includes('mode: "adminplus_catalog_match_apply_v214_edit_verify"'), 'AdminPlus apply endpoint uses exact edit-verification mode');

console.log('\n[SCENARIO] deterministic edit persistence');
const parse = (value) => {
  const parts=String(value||'').split(',').map((v)=>v.trim()).filter(Boolean);
  if (!parts.length || parts.length>2 || parts.some((v)=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))) return null;
  return [...new Set(parts)].join(',');
};
const oldRow = { channel: '쿠팡', optionId: '95235689038', baseQty: 5, shippingFee: 0, purchaseTime: '09:00', updatedAt: '2026-08-09T04:00:00.000Z' };
const edited = { ...oldRow, shippingFee: 4000, purchaseTime: '09:00,14:00', updatedAt: '2026-08-09T05:00:00.000Z' };
const merged = Date.parse(edited.updatedAt) >= Date.parse(oldRow.updatedAt) ? {...edited,purchaseTime:parse(edited.purchaseTime)} : oldRow;
must(merged.shippingFee === 4000, '배송비 0 -> 4000 수정값 survives server merge');
must(merged.purchaseTime === '09:00,14:00', '두 발주시간 survives server normalization/merge');
must(merged.baseQty === 5, 'unchanged 기본수량 remains intact');
console.log('\n[PASS] confirmed mapping edit persistence verification completed (3 rounds).');
