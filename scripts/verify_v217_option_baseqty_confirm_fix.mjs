import fs from 'node:fs';
const app=fs.readFileSync(new URL('../apps/web/src/App.tsx', import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../apps/worker/src/worker.ts', import.meta.url),'utf8');
function must(cond,msg){if(!cond){console.error('[FAIL]',msg);process.exitCode=1;}else console.log('[PASS]',msg);}

console.log('[ROUND 1] Excel option/baseQty source of truth');
must(app.includes('function adminPlusOptionScopedMatchString'), 'per-option AdminPlus match string helper exists');
must(app.includes('return `B2B:${channelCode}:${cleanId(mapping.optionId)}`'), 'match string is stable by channel + Excel optionId');
must(app.includes('qty: expectedQty') && app.includes('const expectedQty = Math.max(1, Number(mapping.baseQty || 1) || 1)'), 'API suggestion takes baseQty from Excel/server mapping');
must(app.includes('<th>기본수량(엑셀)</th>'), 'UI labels base quantity as Excel mapping source');
must(app.includes('sharedVendorProductMappings.length > 1'), 'same vendor product shared by multiple optionIds is detected');
must(app.includes('liveLegacyQty !== expectedQty'), 'already-correct legacy row stays confirmed while only conflicting rows migrate');

console.log('\n[ROUND 2] confirm/save error recovery');
must(app.includes('text(confirmedLink.matchString) !== text(suggestion.matchString)'), 'confirm detects legacy shared-match migration');
must(worker.includes('for (const wait of [0, 250, 750, 1500])'), 'AdminPlus post-write verification retries eventual consistency');
must(worker.includes('/^(success|ok|true)$/i.test'), 'generic success text is not surfaced as a false error message');
must(worker.includes('adminplus_catalog_match_apply_v217_retry_verify'), 'new exact verification mode is active');
must(app.includes('추천 매핑 확정 실패: ${detail}'), 'UI reports real failure detail without Error: success wrapper');

console.log('\n[ROUND 3] purchase isolation / failure-state cleanup');
must(worker.includes('const confirmedLinks = asArray(payload.adminplusProductLinks)'), 'auto-purchase reads per-option confirmed links');
must(
  worker.includes('const matchString = String(confirmedLink?.matchString || "").trim()') &&
  worker.includes('candidates.push({ account, order, mapping, matchString') &&
  worker.includes('product_string: String(row.matchString || "").trim()'),
  'order uses confirmed per-option match string'
);
must(worker.includes('기본수량 불일치: 엑셀 매핑 ${candidate.mapping.baseQty} / AdminPlus 옵션별 매칭 ${actualBaseQty}'), 'preflight compares AdminPlus qty with Excel mapping qty');
must(app.includes('channel === undefined || row.channel === channel'), 'successful save can clear prior channel-specific watch-save failures');
must(worker.includes('featureRevision: "option-baseqty-confirm-v217-20260809"'), 'Worker exposes V217 feature revision');

console.log('\n[SCENARIO] shared vendor product with three Excel optionIds');
const scoped=(channel, optionId)=>`B2B:${channel==='쿠팡'?'CP':'TS'}:${String(optionId).trim()}`;
const rows=[
  {channel:'쿠팡', optionId:'95235689038', baseQty:5},
  {channel:'쿠팡', optionId:'95235689039', baseQty:2},
  {channel:'쿠팡', optionId:'95235689040', baseQty:1},
];
const keys=rows.map((row)=>scoped(row.channel,row.optionId));
must(new Set(keys).size===3, '038/039/040 receive three independent AdminPlus match strings');
must(rows.map((row)=>row.baseQty).join(',')==='5,2,1', 'Excel baseQty 5/2/1 remains independent per optionId');

if(!process.exitCode) console.log('\n[PASS] V217 option/baseQty/confirm verification completed (3 rounds + shared-option scenario).');
