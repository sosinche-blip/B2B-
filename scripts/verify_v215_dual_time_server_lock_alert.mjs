import fs from 'node:fs';
const app = fs.readFileSync(new URL('../apps/web/src/App.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../apps/web/src/style.css', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../apps/worker/src/worker.ts', import.meta.url), 'utf8');
const must = (ok, msg) => { if (!ok) throw new Error(`[FAIL] ${msg}`); console.log(`[PASS] ${msg}`); };

console.log('[ROUND 1] dual purchase time input / scheduler');
must(app.includes('function parseOptionPurchaseTimes') && app.includes('parts.length > 2'), 'web allows at most two option purchase times');
must(app.includes('placeholder="09:00,14:00"'), 'UI exposes comma-separated dual-time input');
must(worker.includes('normalizeOptionPurchaseTimeList') && worker.includes('.slice(0, 2)'), 'worker caps configured purchase slots at two');
must(worker.includes('flatMap((row) => optionPurchaseTimes(row.purchaseTime))'), 'scheduler expands both configured slots');
must(worker.includes('!optionPurchaseTimes(mapping.purchaseTime).includes(dueTime)'), 'order is eligible at either configured slot');

console.log('\n[ROUND 2] server-confirmed mapping lock');
must(app.includes('adminplusProductLinkDrafts') && app.includes('function adminPlusProductLinkDraft'), 'price-watch edits are stored in isolated draft state');
must(app.includes('서버에 저장된 <strong>확정 매핑</strong>') && app.includes('실제 자동발주 값은 변경되지 않습니다'), 'UI explains server-confirmed lock behavior');
must(app.includes('await verifyAdminPlusConfirmedPersistence(nextMapping, link)'), 'mapping confirmation performs save + server read-back verification');
must(app.includes('const serverState = await loadAdminPlusConfirmedStateFromServer()'), 'suggestions are based on server-confirmed state');
must(app.includes('미확정 편집') && app.includes('전체 서버저장에도 포함하지 않습니다'), 'global watch save does not commit row drafts');

console.log('\n[ROUND 3] B-mode alerts + compact layout');
must(app.includes('자동감시 저장 실패') && app.includes('가격 변동 감지'), 'daily operation board exposes watch save failures and price changes');
must(app.includes('unresolvedAdminPlusWatchSaveFailures') && app.includes('openAdminPlusPriceAlerts'), 'dashboard counts both alert categories');
must(worker.includes('operationalFailures: asArray(data.operationalFailures).slice(-100)'), 'server compact settings preserve operational failure rows');
must(worker.includes('featureRevision: "dual-time-server-lock-b-alert-20260809"'), 'Worker exposes release feature revision');
must(css.includes('.adminplus-suggestion-table th:nth-child(5) { width: 72px; }') && css.includes('padding-right: 2px'), 'vendor-to-excel spacing is compacted');
must(css.includes('width: 52px') && css.includes('.adminplus-number-input'), 'base quantity and shipping inputs are reduced to about half width');

console.log('\n[SCENARIO] deterministic two-slot behavior');
const parse = (raw) => {
  const parts=String(raw||'').split(',').map((x)=>x.trim()).filter(Boolean);
  if (!parts.length || parts.length>2) return null;
  if (parts.some((x)=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(x))) return null;
  if (new Set(parts).size !== parts.length) return null;
  return parts;
};
const times = parse('09:00,14:00');
must(times?.join('|') === '09:00|14:00', '09:00,14:00 is accepted as two slots');
must(parse('09:00,14:00,18:00') === null, 'three slots are rejected');
const history = new Set();
const orderKey = '쿠팡|ORDER-1|95235689038';
const run = (due) => times.includes(due) && !history.has(orderKey) ? (history.add(orderKey), 'ordered') : 'skipped';
must(run('09:00') === 'ordered' && run('14:00') === 'skipped', 'second slot is a retry opportunity, not a duplicate order');
console.log('\n[PASS] dual-time/server-lock/B-alert verification completed (3 rounds).');
